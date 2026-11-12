# Golden-master diff: p6-base to p6-base2

Compared 3277 requests with 3277. **3 changed, 0 added, 0 removed.**

## By route

| Route | Requests changed | Roles | Status changes | Most changed paths |
|---|---|---|---|---|
| /api/collector/overview | 2 | collector | none | $.map.pins[*].lat (2), $.map.pins[*].lon (2) |
| /api/collector/search | 1 | collector | none | $.incidents[*].lat (1), $.incidents[*].lon (1) |

## Each changed request

### collector GET /api/collector/search?q=<new-complaint-code-1>

Session writes, id cd47878c4defdb30, 1202 bytes to 1202 bytes.

| Path | A | B |
|---|---|---|
| $.incidents[0].lat | 13.018193137254903 | 13.016326470588236 |
| $.incidents[0].lon | 80.21036896078431 | 80.21011798039216 |

### collector GET /api/collector/overview

Session writes, id ea0ab3f25bc17c26, 232509 bytes to 232509 bytes.

| Path | A | B |
|---|---|---|
| $.map.pins[72].lat | 13.018193137254903 | 13.016326470588236 |
| $.map.pins[72].lon | 80.21036896078431 | 80.21011798039216 |

### collector GET /api/collector/overview?period=weekly&zone=13

Session writes, id 3f54c3ecc14de285, 140493 bytes to 140493 bytes.

| Path | A | B |
|---|---|---|
| $.map.pins[23].lat | 13.018193137254903 | 13.016326470588236 |
| $.map.pins[23].lon | 80.21036896078431 | 80.21011798039216 |

