package com.marlowefinch.ops;

import java.time.Clock;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

/**
 * A closed date range for the query endpoints.
 *
 * Both bounds default to "the last 30 days ending today". {@link #resolve} validates the
 * raw request strings (ISO dates, {@code from <= to}, at most {@value #MAX_SPAN_DAYS} days
 * inclusive) and throws {@link InvalidRequestException} listing every problem. The record
 * constructor itself stays unchecked so a range can be built directly. See TODO-232.
 */
public record DateRange(LocalDate from, LocalDate to) {

    public static final int DEFAULT_DAYS = 30;
    public static final int MAX_SPAN_DAYS = 366;
    public static final int MIN_LIMIT = 1;
    public static final int MAX_LIMIT = 500;

    public static DateRange resolve(String from, String to, Clock clock) {
        List<String> errors = new ArrayList<>();
        DateRange range = resolve(from, to, clock, errors);
        if (!errors.isEmpty()) {
            throw new InvalidRequestException(errors);
        }
        return range;
    }

    /** Like {@link #resolve(String, String, Clock)} but appends problems to {@code errors}; returns null if any. */
    public static DateRange resolve(String from, String to, Clock clock, List<String> errors) {
        LocalDate today = LocalDate.now(clock);
        LocalDate end = parse(to, "to", today, errors);
        LocalDate start = parse(from, "from", today.minusDays(DEFAULT_DAYS), errors);
        if (start == null || end == null) {
            return null;
        }
        if (start.isAfter(end)) {
            errors.add("from must be on or before to");
            return null;
        }
        if (ChronoUnit.DAYS.between(start, end) + 1 > MAX_SPAN_DAYS) {
            errors.add("the range must span at most " + MAX_SPAN_DAYS + " days");
            return null;
        }
        return new DateRange(start, end);
    }

    /** Parses an optional limit; blank/null gives {@code defaultValue}. Returns -1 after recording an error. */
    public static int parseLimit(String limit, int defaultValue, List<String> errors) {
        if (limit == null || limit.isBlank()) {
            return defaultValue;
        }
        try {
            int value = Integer.parseInt(limit.trim());
            if (value >= MIN_LIMIT && value <= MAX_LIMIT) {
                return value;
            }
        } catch (NumberFormatException e) {
            // falls through to the error below
        }
        errors.add("limit must be an integer between " + MIN_LIMIT + " and " + MAX_LIMIT);
        return -1;
    }

    private static LocalDate parse(String value, String name, LocalDate fallback, List<String> errors) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        try {
            return LocalDate.parse(value.trim());
        } catch (DateTimeParseException e) {
            errors.add(name + " must be an ISO date (YYYY-MM-DD)");
            return null;
        }
    }
}
