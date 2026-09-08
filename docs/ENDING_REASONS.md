# Ending reasons for golden rallies

`ending_reason` records the point result from the final racket or paddle contact. New and updated
golden rows accept exactly three values:

```text
service_fault | unforced_error | winner
```

This vocabulary follows the labelled result and last contact. It does not ask the annotator to
judge how much pressure caused an error.

## Decision procedure

1. If the serve itself is faulty or illegal and ends the point, choose `service_fault`.
2. Otherwise identify which side made the final contact with the shuttle or ball.
3. If the point-losing side made that contact, choose `unforced_error`.
4. If the point-winning side made that contact and the defending side made no contact with the
   final shot, choose `winner`.

### `service_fault`

The serve itself is faulty or illegal and ends the point. Examples include a serve into the net, a
serve outside the valid service area, an illegal service action, or a point-ending double fault in
a sport that permits a second serve.

### `unforced_error`

The point-losing side made the final contact, so the opposite side gains the point. This includes a
contact that sends the shuttle or ball out, into the net, or otherwise fails to make a legal
return. The label does not change because the preceding shot put the player under pressure.

### `winner`

The point-winning side made the final contact and the defending player or players who should return
the shuttle or ball made no contact before the point ended. A legal, untouched ace is a winner.

## Shot count

`shots_count` is required and must be a whole number of 1 or more. Count racket or paddle contacts
with the shuttle or ball, including the serve. A contacted return attempt counts even when it fails.
A missed swing or deliberately unplayed return adds no shot. Do not count bounces, net contacts, or
repeated views of the same stroke.

## Legacy rows and lets

Existing CSVs can contain blank counts or the historical reasons `unknown`, `let`, `forced_error`,
or `other`. The annotator loads and displays those source values, marks the rows as needing review,
and never remaps them automatically. Editing such a row requires a positive shot count and one of
the three current reasons.

A true let awards no point. Preserve that source fact for audit and exclude the interval from the
three-result point-ending training corpus. Do not invent a point-ending reason merely to make the
row eligible.
