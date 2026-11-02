"""Background jobs: analyses take a minute (slow, polite requests to Kleinanzeigen), so the browser
starts one, then polls its progress. One worker runs the jobs in turn, which also keeps the
request rate to Kleinanzeigen low whatever the number of users."""

from __future__ import annotations

import logging
import threading
import time
import uuid
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any

log = logging.getLogger(__name__)

JOB_TTL_SECONDS = 2 * 60 * 60


class JobCancelled(Exception):
    pass


class UserFacingError(Exception):
    """An expected failure with a code the frontend translates ("gone", "blocked", "not_car" ...)."""

    def __init__(self, code: str, **details: Any):
        super().__init__(code)
        self.code = code
        self.details = details


@dataclass
class Job:
    id: str
    kind: str
    owner: str
    steps: list[dict]
    status: str = "queued"  # queued | running | done | error | cancelled
    progress: dict = field(default_factory=dict)
    partial: dict = field(default_factory=dict)
    result: Any = None
    error: dict | None = None
    created: float = field(default_factory=time.time)
    updated: float = field(default_factory=time.time)
    cancel_event: threading.Event = field(default_factory=threading.Event)

    def step(self, key: str, state: str, **detail: Any) -> None:
        for step in self.steps:
            if step["key"] == key:
                step["state"] = state
                step.update(detail)
        self.updated = time.time()

    def bump(self, counter: str, by: int = 1) -> None:
        self.progress[counter] = self.progress.get(counter, 0) + by
        self.updated = time.time()

    def check_cancel(self) -> None:
        if self.cancel_event.is_set():
            raise JobCancelled()

    def public(self, position: int | None = None) -> dict:
        return {
            "id": self.id, "kind": self.kind, "status": self.status, "steps": self.steps,
            "progress": self.progress, "partial": self.partial, "result": self.result, "error": self.error,
            "queue_position": position, "created": self.created, "updated": self.updated,
        }


class JobManager:
    def __init__(self, workers: int = 1, max_per_owner: int = 3):
        self.jobs: dict[str, Job] = {}
        self.order: list[str] = []
        self.lock = threading.Lock()
        self.executor = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="job")
        self.max_per_owner = max_per_owner

    def submit(self, kind: str, owner: str, steps: list[str], work: Callable[[Job], Any]) -> Job:
        with self.lock:
            self._forget_old()
            active = [j for j in self.jobs.values() if j.owner == owner and j.status in ("queued", "running")]
            if len(active) >= self.max_per_owner:
                raise UserFacingError("too_many_jobs", limit=self.max_per_owner)
            job = Job(id=uuid.uuid4().hex[:16], kind=kind, owner=owner,
                      steps=[{"key": key, "state": "pending"} for key in steps])
            self.jobs[job.id] = job
            self.order.append(job.id)
        self.executor.submit(self._run, job, work)
        return job

    def _run(self, job: Job, work: Callable[[Job], Any]) -> None:
        if job.cancel_event.is_set():
            job.status = "cancelled"
            return
        job.status = "running"
        job.updated = time.time()
        try:
            job.result = work(job)
            job.status = "cancelled" if job.cancel_event.is_set() and job.kind != "hunt" else "done"
        except JobCancelled:
            job.status = "cancelled"
        except UserFacingError as exc:
            job.status, job.error = "error", {"code": exc.code, **exc.details}
        except Exception as exc:  # one broken job must not take the worker down
            log.exception("job %s (%s) failed", job.id, job.kind)
            job.status, job.error = "error", {"code": "internal", "message": f"{type(exc).__name__}: {exc}"[:300]}
        finally:
            job.updated = time.time()
            for step in job.steps:
                if step["state"] == "active":
                    step["state"] = "done" if job.status == "done" else "failed"

    def get(self, job_id: str, owner: str) -> Job | None:
        job = self.jobs.get(job_id)
        return job if job is not None and job.owner == owner else None

    def active(self, owner: str) -> list[Job]:
        with self.lock:
            return [self.jobs[j] for j in self.order
                    if self.jobs[j].owner == owner and self.jobs[j].status in ("queued", "running")]

    def position(self, job: Job) -> int | None:
        """How many jobs run or wait before this one (0 = it runs now)."""
        if job.status != "queued":
            return None
        with self.lock:
            ahead = [j for j in self.order[: self.order.index(job.id)]
                     if self.jobs[j].status in ("queued", "running")]
        return len(ahead)

    def cancel(self, job_id: str, owner: str) -> bool:
        job = self.get(job_id, owner)
        if job is None:
            return False
        job.cancel_event.set()
        return True

    def _forget_old(self) -> None:
        cutoff = time.time() - JOB_TTL_SECONDS
        for job_id in [j for j, job in self.jobs.items() if job.updated < cutoff and job.status not in ("queued", "running")]:
            del self.jobs[job_id]
            self.order.remove(job_id)
