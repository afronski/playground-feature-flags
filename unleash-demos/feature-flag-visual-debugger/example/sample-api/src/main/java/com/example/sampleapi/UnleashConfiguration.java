package com.example.sampleapi;

import io.getunleash.DefaultUnleash;
import io.getunleash.Unleash;
import io.getunleash.util.UnleashConfig;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class UnleashConfiguration {

    @Bean
    public Unleash unleash(@Value("${unleash.api-url}") String apiUrl,
                           @Value("${unleash.api-token}") String apiToken,
                           @Value("${unleash.app-name}") String appName) {
        UnleashConfig config = UnleashConfig.builder()
                .appName(appName)
                .instanceId("sample-api-1")
                .unleashAPI(apiUrl)
                .apiKey(apiToken)
                .fetchTogglesInterval(5)
                .sendMetricsInterval(5)
                .synchronousFetchOnInitialisation(true)
                .build();
        return new DefaultUnleash(config);
    }
}
