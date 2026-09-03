/**
 * Kleine Helfer zum Aufbau von DOM-Bäumen.
 *
 * Bewusst ohne `innerHTML`: Titel, Beschreibungen und Kanalnamen stammen von
 * fremden Nutzern (den Creatorn). Über `textContent` gesetzt, können sie kein
 * Markup einschleusen – der Standardschutz gegen Cross-Site-Scripting.
 */

/**
 * Erzeugt ein Element.
 *
 * @param {string} tag           Tag-Name
 * @param {object} [attrs]       Attribute; `class`, `text`, `html` und `on*` werden gesondert behandelt
 * @param {Array|Node|string} [children] Kindknoten
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);

    for (const [key, value] of Object.entries(attrs)) {
        if (value === null || value === undefined || value === false) continue;

        if (key === 'class') {
            node.className = value;
        } else if (key === 'text') {
            node.textContent = value;
        } else if (key === 'dataset') {
            Object.assign(node.dataset, value);
        } else if (key.startsWith('on') && typeof value === 'function') {
            node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (value === true) {
            node.setAttribute(key, '');
        } else {
            node.setAttribute(key, value);
        }
    }

    for (const child of [].concat(children)) {
        if (child === null || child === undefined || child === false) continue;
        node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
}

/** Ersetzt den gesamten Inhalt eines Containers. */
export function replace(container, ...children) {
    container.replaceChildren(...children.filter(Boolean));
}

/** Blendet kurz einen Hinweis am unteren Bildschirmrand ein. */
export function toast(message, action) {
    const box = document.getElementById('toast');
    const parts = [el('span', { text: message })];

    if (action) {
        parts.push(el('button', {
            type: 'button',
            text: action.label,
            onclick: () => {
                action.run();
                hideToast();
            }
        }));
    }

    replace(box, ...parts);
    box.hidden = false;

    clearTimeout(box.dataset.timer);
    box.dataset.timer = String(setTimeout(hideToast, action ? 7000 : 3500));
}

function hideToast() {
    const box = document.getElementById('toast');
    clearTimeout(box.dataset.timer);
    box.hidden = true;
}
