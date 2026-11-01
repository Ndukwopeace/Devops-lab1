package com.example.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

// Integration test: real MySQL. The database is a disposable container
// started by scripts/ci/test-component.sh locally or by `services:` in CI.
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ItemApiIT {

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        // Fail loudly if the disposable test database was not provided.
        String host = require("TEST_DB_HOST");
        String port = require("TEST_DB_PORT");
        String name = require("TEST_DB_NAME");
        String user = require("TEST_DB_USER");
        // Refuse to touch anything that is not clearly a test database.
        if (!name.contains("test")) {
            throw new IllegalStateException("TEST_DB_NAME must contain 'test'");
        }
        String password = System.getenv().getOrDefault("TEST_DB_PASSWORD", "");
        registry.add("spring.datasource.url", () ->
                "jdbc:mysql://" + host + ":" + port + "/" + name + "?allowPublicKeyRetrieval=true&useSSL=false");
        registry.add("spring.datasource.username", () -> user);
        registry.add("spring.datasource.password", () -> password);
    }

    private static String require(String key) {
        String value = System.getenv(key);
        if (value == null || value.isEmpty()) {
            throw new IllegalStateException(
                    "integration test needs " + key + " (see scripts/ci/test-component.sh)");
        }
        return value;
    }

    @Autowired
    TestRestTemplate rest;

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void itemsRoundtripAgainstMysql() {
        jdbc.execute("TRUNCATE TABLE items");

        assertThat(rest.getForEntity("/actuator/health", String.class).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(rest.getForObject("/items", Item[].class)).isEmpty();

        var created = rest.postForEntity("/items", Map.of("name", "from-integration-test"), Item.class);
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);

        List<Item> items = List.of(rest.getForObject("/items", Item[].class));
        assertThat(items).hasSize(1);
        assertThat(items.get(0).name()).isEqualTo("from-integration-test");
    }
}
