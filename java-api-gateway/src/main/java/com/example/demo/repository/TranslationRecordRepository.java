package com.example.demo.repository;

import com.example.demo.entity.TranslationRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface TranslationRecordRepository extends JpaRepository<TranslationRecord, Long> {
    // Spring Data JPA sẽ tự động tạo các hàm save, findById, delete cho bạn.
}