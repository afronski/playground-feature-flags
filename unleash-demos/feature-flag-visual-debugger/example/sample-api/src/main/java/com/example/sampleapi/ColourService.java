package com.example.sampleapi;

import io.opentelemetry.api.GlobalOpenTelemetry;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.context.Scope;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class ColourService {

    private final JdbcTemplate jdbcTemplate;

    public ColourService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public String fetchColour_FlagOFF() {
        Tracer tracer = GlobalOpenTelemetry.getTracer("sample-api");
        Span span = tracer.spanBuilder("fetchColour_FlagOFF").startSpan();
        try (Scope ignored = span.makeCurrent()) {
            String sql = "SELECT hex_value FROM colours WHERE name = ?";
            String param = "blue";
            span.setAttribute(AttributeKey.stringKey("db.statement"), sql);
            span.setAttribute(AttributeKey.stringKey("db.query.parameter.name"), param);
            String result = jdbcTemplate.queryForObject(sql, String.class, param);
            span.setAttribute(AttributeKey.stringKey("db.result.hex_value"), result != null ? result : "null");
            span.setAttribute(AttributeKey.longKey("db.result.row_count"), result != null ? 1 : 0);
            return result;
        } finally {
            span.end();
        }
    }

    public String fetchColour_FlagON() {
        Tracer tracer = GlobalOpenTelemetry.getTracer("sample-api");
        Span span = tracer.spanBuilder("fetchColour_FlagON").startSpan();
        try (Scope ignored = span.makeCurrent()) {
            String sql = "SELECT hex_value FROM colours WHERE name = ?";
            String param = "green";
            span.setAttribute(AttributeKey.stringKey("db.statement"), sql);
            span.setAttribute(AttributeKey.stringKey("db.query.parameter.name"), param);
            String result = jdbcTemplate.queryForObject(sql, String.class, param);
            span.setAttribute(AttributeKey.stringKey("db.result.hex_value"), result != null ? result : "null");
            span.setAttribute(AttributeKey.longKey("db.result.row_count"), result != null ? 1 : 0);
            return result;
        } finally {
            span.end();
        }
    }
}
