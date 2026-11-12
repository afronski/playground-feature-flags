package com.example.sampleapi;

import io.getunleash.Unleash;
import io.getunleash.UnleashContext;
import io.opentelemetry.api.GlobalOpenTelemetry;
import io.opentelemetry.api.baggage.Baggage;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.Tracer;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class LightbulbController {

    private final Unleash unleash;
    private final ColourService colourService;

    public LightbulbController(Unleash unleash, ColourService colourService) {
        this.unleash = unleash;
        this.colourService = colourService;
    }

    @CrossOrigin(origins = "*")
    @GetMapping("/api/lightbulb")
    public Map<String, String> getLightbulb() {
        // Extract session.id from baggage and set it as a span attribute
        String sessionId = Baggage.current().getEntryValue("session.id");
        Span currentSpan = Span.current();
        if (sessionId != null) {
            currentSpan.setAttribute("session.id", sessionId);
        }

        // Build Unleash context from trace baggage
        UnleashContext unleashContext = UnleashContext.builder()
                .appName("sample-api")
                .environment("development")
                .sessionId(sessionId != null ? sessionId : "unknown")
                .build();

        Tracer tracer = GlobalOpenTelemetry.getTracer("sample-api");

        Span flagSpan = tracer.spanBuilder("feature_flag.evaluate").startSpan();
        boolean enabled;
        try {
            enabled = unleash.isEnabled("lightbulb-colour", unleashContext);
            flagSpan.setAttribute(AttributeKey.stringKey("feature_flag.key"), "lightbulb-colour");
            flagSpan.setAttribute(AttributeKey.stringKey("feature_flag.provider_name"), "unleash");
            flagSpan.setAttribute(AttributeKey.stringKey("feature_flag.variant"), enabled ? "enabled" : "disabled");
            flagSpan.setAttribute(AttributeKey.stringKey("unleash.context.app_name"), "sample-api");
            flagSpan.setAttribute(AttributeKey.stringKey("unleash.context.environment"), "development");
            flagSpan.setAttribute(AttributeKey.stringKey("unleash.context.session_id"),
                    sessionId != null ? sessionId : "unknown");
        } finally {
            flagSpan.end();
        }

        String hexValue = enabled ? colourService.fetchColour_FlagON() : colourService.fetchColour_FlagOFF();
        return Map.of("colour", hexValue);
    }
}
