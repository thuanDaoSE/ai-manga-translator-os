package com.example.demo.entity;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Entity
@Table(name = "translation_records")
@Data // Của Lombok, tự sinh Getter/Setter
public class TranslationRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "original_file_name")
    private String originalFileName;

    @Column(name = "japanese_text", columnDefinition = "TEXT")
    private String japaneseText;

    @Column(name = "translated_text", columnDefinition = "TEXT")
    private String translatedText;

    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();
}