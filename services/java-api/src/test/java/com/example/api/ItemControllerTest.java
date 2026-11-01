package com.example.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

// Unit test: web layer only, repository mocked, no database.
@WebMvcTest(ItemController.class)
class ItemControllerTest {

    @Autowired
    MockMvc mvc;

    @MockBean
    ItemRepository repository;

    @Test
    void listReturnsItems() throws Exception {
        when(repository.findAll()).thenReturn(List.of(new Item(1, "widget")));

        mvc.perform(get("/items"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(1))
                .andExpect(jsonPath("$[0].name").value("widget"));
    }

    @Test
    void postCreatesTrimmedItem() throws Exception {
        when(repository.add("widget")).thenReturn(new Item(7, "widget"));

        mvc.perform(post("/items").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"  widget \"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(7))
                .andExpect(jsonPath("$.name").value("widget"));
    }

    @Test
    void postRejectsInvalidNames() throws Exception {
        for (String body : List.of("{}", "{\"name\":\"\"}", "{\"name\":\"   \"}", "{\"name\":5}")) {
            mvc.perform(post("/items").contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest());
        }
        verify(repository, never()).add(any());
    }
}
