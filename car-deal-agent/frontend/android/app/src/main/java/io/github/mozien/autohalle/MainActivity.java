package io.github.mozien.autohalle;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;

/** AutoHalle: the web app in a native shell, so the phone itself can load the ads it checks. */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String route = sharedAdRoute(getIntent());
        if (route != null && bridge != null) {
            // Started by "Teilen": open the app directly on the check of the shared ad.
            bridge.getWebView().loadUrl(bridge.getAppUrl() + route);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String route = sharedAdRoute(intent);
        if (route == null || bridge == null) return;
        WebView view = bridge.getWebView();
        view.post(() -> view.evaluateJavascript("window.location.hash = " + JSONObject.quote(route) + ";", null));
    }

    /** "#/analyze?url=<shared text>" for a shared text (the app finds the ad link in it), else null. */
    private static String sharedAdRoute(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return null;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null || text.trim().isEmpty()) return null;
        return "#/analyze?url=" + Uri.encode(text.trim());
    }
}
