package app.lovable.gpva;

import android.os.Bundle;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Android WebView M139+ resizes the visual viewport when the IME
        // keyboard appears. In this app the Activity already controls the
        // soft-input behavior, so forwarding IME insets to the WebView starts a
        // native viewport/insets negotiation exactly when an input receives
        // focus. On affected Android/WebView builds that blocks the main
        // thread long enough for InputConnection to expire. Consume IME insets
        // from the first layout pass and keep keyboard handling native-only.
        if (bridge != null && bridge.getWebView() != null) {
            ViewCompat.setOnApplyWindowInsetsListener(bridge.getWebView(), (view, insets) -> {
                return new WindowInsetsCompat.Builder(insets)
                    .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
                    .build();
            });
        }
    }
}
