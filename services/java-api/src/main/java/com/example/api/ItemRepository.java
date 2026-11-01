package com.example.api;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class ItemRepository {
    private final JdbcTemplate jdbc;

    public ItemRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Item> findAll() {
        return jdbc.query("SELECT id, name FROM items ORDER BY id",
                (rs, i) -> new Item(rs.getLong("id"), rs.getString("name")));
    }

    public Item add(String name) {
        GeneratedKeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO items (name) VALUES (?)", Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, name);
            return ps;
        }, keys);
        return new Item(keys.getKey().longValue(), name);
    }
}
