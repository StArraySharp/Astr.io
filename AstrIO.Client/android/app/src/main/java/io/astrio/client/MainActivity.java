package io.astrio.client;

import android.os.Bundle;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** 上次按返回键的时间戳（双击退出用） */
    private long lastBackAt = 0L;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // ★ onCreate 也隐藏状态栏:onResume 要到首次显示之后才回调,
        //   冷启动会先闪一帧带状态栏的画面;两处都调,谁先生效都无副作用。
        hideStatusBars();

        // 返回键：先问网页（关子面板 / 关主菜单），网页不处理才走「再按一次退出」。
        // 对应 JS 侧 window.__androidBack（见 src/js/index.js installAndroidBackBridge）。
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView wv = getBridge() != null ? getBridge().getWebView() : null;
                if (wv == null) {
                    finish();
                    return;
                }
                wv.evaluateJavascript(
                    "(function(){try{return !!(window.__androidBack && window.__androidBack());}catch(e){return false;}})()",
                    value -> {
                        if ("true".equals(value)) {
                            return;   // 网页已处理：关子面板 / 关主菜单
                        }
                        long now = System.currentTimeMillis();
                        if (now - lastBackAt < 2000L) {
                            finish();   // 2 秒内按第二次 → 退出
                        } else {
                            lastBackAt = now;
                            Toast.makeText(MainActivity.this, "再按一次退出", Toast.LENGTH_SHORT).show();
                        }
                    });
            }
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        // 从后台切回时系统会恢复状态栏 → 这里再隐藏一次
        hideStatusBars();
    }

    /**
     * 隐藏顶部状态栏（时间/电量/信号条）。
     * 注意：这只是「不显示状态栏」，跟 edge-to-edge 不是一回事 ——
     * WebView 的高度会相应变大、window.innerHeight 依然正确，
     * 所以不会重现之前 canvas 被裁的问题。
     */
    private void hideStatusBars() {
        WindowInsetsControllerCompat c =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (c != null) {
            c.hide(WindowInsetsCompat.Type.statusBars());
            // 用户从顶部下滑时临时显示，松手自动隐藏（不会把布局顶下去）
            c.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        }
    }
}
