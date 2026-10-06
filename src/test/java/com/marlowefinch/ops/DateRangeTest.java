package com.marlowefinch.ops;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

/** Unit tests for the parameter validation in {@link DateRange} (TODO-232). */
class DateRangeTest {

    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-09-21T10:00:00Z"), ZoneOffset.UTC);

    @Test
    void defaultsAreTheLast30DaysEndingToday() {
        DateRange range = DateRange.resolve(null, null, CLOCK);
        assertThat(range.from()).isEqualTo(LocalDate.of(2026, 8, 22));
        assertThat(range.to()).isEqualTo(LocalDate.of(2026, 9, 21));
    }

    @Test
    void invalidInputThrowsWithTheExactMessages() {
        assertThatThrownBy(() -> DateRange.resolve("x", "y", CLOCK))
                .isInstanceOf(InvalidRequestException.class)
                .extracting(e -> ((InvalidRequestException) e).errors())
                .isEqualTo(List.of("to must be an ISO date (YYYY-MM-DD)", "from must be an ISO date (YYYY-MM-DD)"));
        assertThatThrownBy(() -> DateRange.resolve("2026-02-01", "2026-01-01", CLOCK))
                .isInstanceOf(InvalidRequestException.class)
                .extracting(e -> ((InvalidRequestException) e).errors())
                .isEqualTo(List.of("from must be on or before to"));
    }

    @Test
    void spanIsInclusiveOf366Days() {
        assertThat(DateRange.resolve("2026-01-01", "2027-01-01", CLOCK).to()).isEqualTo(LocalDate.of(2027, 1, 1));
        assertThatThrownBy(() -> DateRange.resolve("2026-01-01", "2027-01-02", CLOCK))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void sameDayRangeIsValid() {
        assertThat(DateRange.resolve("2026-09-01", "2026-09-01", CLOCK).from()).isEqualTo(LocalDate.of(2026, 9, 1));
    }

    @Test
    void theRecordConstructorStaysUnchecked() {
        DateRange backwards = new DateRange(LocalDate.of(2026, 9, 21), LocalDate.of(2026, 9, 1));
        assertThat(backwards.from()).isAfter(backwards.to());
    }

    @Test
    void parseLimitHandlesDefaultsBoundsAndGarbage() {
        List<String> errors = new ArrayList<>();
        assertThat(DateRange.parseLimit(null, 20, errors)).isEqualTo(20);
        assertThat(DateRange.parseLimit("  ", 20, errors)).isEqualTo(20);
        assertThat(DateRange.parseLimit("1", 20, errors)).isEqualTo(1);
        assertThat(DateRange.parseLimit(" 500 ", 20, errors)).isEqualTo(500);
        assertThat(errors).isEmpty();
        for (String bad : new String[] {"0", "501", "-1", "abc", "1.5", "99999999999"}) {
            assertThat(DateRange.parseLimit(bad, 20, errors)).isEqualTo(-1);
        }
        assertThat(errors).hasSize(6).containsOnly("limit must be an integer between 1 and 500");
    }
}
