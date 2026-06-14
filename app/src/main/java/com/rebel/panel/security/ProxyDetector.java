package com.rebel.panel.security;

import java.net.Proxy;
import java.net.ProxySelector;
import java.net.URI;
import java.util.List;

/** Layer 7 — detect system HTTP proxy (Charles/Burp). */
public final class ProxyDetector {

    private ProxyDetector() {}

    public static boolean mitmProxyActive() {
        try {
            List<Proxy> proxies = ProxySelector.getDefault()
                    .select(URI.create("https://rebelbhaiya.alwaysdata.net"));
            for (Proxy p : proxies) {
                if (p.type() != Proxy.Type.DIRECT) return true;
            }
        } catch (Exception ignored) {}
        String host = System.getProperty("http.proxyHost");
        return host != null && !host.isEmpty();
    }
}
