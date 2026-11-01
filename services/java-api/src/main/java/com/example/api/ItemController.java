package com.example.api;

import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class ItemController {
    private final ItemRepository repository;

    public ItemController(ItemRepository repository) {
        this.repository = repository;
    }

    @GetMapping("/items")
    public List<Item> list() {
        return repository.findAll();
    }

    @PostMapping("/items")
    @ResponseStatus(HttpStatus.CREATED)
    public Item create(@RequestBody Map<String, Object> body) {
        Object name = body.get("name");
        if (!(name instanceof String s) || s.isBlank() || s.length() > 100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "name must be a non-empty string up to 100 characters");
        }
        return repository.add(s.trim());
    }
}
