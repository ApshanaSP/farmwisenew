# Golden-master diff: p6-base to p6-gate

Compared 3277 requests with 3277. **15 changed, 0 added, 0 removed.**

## What differs around the requests

- next_build_id: XQA-AZMih_i3AILtIqwXF to 7W1366w-32VU0Pwhed8Oy

## By route

| Route | Requests changed | Roles | Status changes | Most changed paths |
|---|---|---|---|---|
| /api/collector/overview | 10 | collector | none | $.snapshot.critical (8), $.map.pins[*].lat (2), $.map.pins[*].lon (2) |
| /api/collector/report | 4 | collector | none | $.snapshot.critical (4) |
| /api/collector/search | 1 | collector | none | $.incidents[*].lat (1), $.incidents[*].lon (1) |

## Each changed request

### collector GET /api/collector/overview?cat=SOLID_WASTE

Session reads, id bea1527b406da7fb, 65517 bytes to 65516 bytes.

| Path | A | B |
|---|---|---|
| $.snapshot.critical | 20 | 0 |

### collector GET /api/collector/overview?cat=DARK_SPOT_SAFETY

Session reads, id a6c1f11197ff2d7d, 29929 bytes to 29928 bytes.

| Path | A | B |
|---|---|---|
| $.snapshot.critical | 20 | 0 |

### collector GET /api/collector/overview?cat=FOOD_SAFETY

Session reads, id 2da516963c159fa5, 29716 bytes to 29715 bytes.

| Path | A | B |
|---|---|---|
| $.snapshot.critical | 20 | 0 |

### collector GET /api/collector/overview?cat=PUBLIC_ORDER

Session reads, id f98e87062fb9c07c, 36885 bytes to 36884 bytes.

| Path | A | B |
|---|---|---|
| $.snapshot.critical | 20 | 0 |

### collector GET /api/collector/overview?taluk=TLK-MYL

Session reads, id ee66b8bc8550bfdb, 75616 bytes to 75615 bytes.

| Path | A | B |
|---|---|---|
| $.snapshot.critical | 20 | 0 |

### collector GET /api/collector/overview?taluk=TLK-SHN

Session reads, id 8d15afb2d6fc9841, 50102 bytes to 50101 bytes.

| Path | A | B |
|---|---|---|
| $.snapshot.critical | 20 | 1 |

### collector GET /api/collector/overview?taluk=TLK-MDR

Session reads, id 13cfa0f8f9a75092, 61655 bytes to 61654 bytes.

| Path | A | B |
|---|---|---|
| $.snapshot.critical | 20 | 0 |

### collector GET /api/collector/overview?period=weekly&taluk=TLK-MYL

Session reads, id e120e15ec8222ac8, 140772 bytes to 140771 bytes.

| Path | A | B |
|---|---|---|
| $.snapshot.critical | 20 | 0 |

### collector GET /api/collector/report?cat=SOLID_WASTE

Session reads2, id 7847baa6b52a9469, 65589 bytes to 65588 bytes.

| Path | A | B |
|---|---|---|
| $.snapshot.critical | 20 | 0 |

### collector GET /api/collector/report?cat=DARK_SPOT_SAFETY

Session reads2, id 8843cab6fdba8ab6, 30000 bytes to 29999 bytes.

| Path | A | B |
|---|---|---|
| $.snapshot.critical | 20 | 0 |

### collector GET /api/collector/report?taluk=TLK-MYL

Session reads2, id 2af87a096780b60d, 86579 bytes to 86578 bytes.

| Path | A | B |
|---|---|---|
| $.snapshot.critical | 20 | 0 |

### collector GET /api/collector/report?taluk=TLK-SHN

Session reads2, id 53ac579dbb8ea3e1, 61522 bytes to 61521 bytes.

| Path | A | B |
|---|---|---|
| $.snapshot.critical | 20 | 1 |

### collector GET /api/collector/search?q=<new-complaint-code-1>

Session writes, id cd47878c4defdb30, 1202 bytes to 1202 bytes.

| Path | A | B |
|---|---|---|
| $.incidents[0].lat | 13.018193137254903 | 13.016499019607844 |
| $.incidents[0].lon | 80.21036896078431 | 80.21072974509804 |

### collector GET /api/collector/overview

Session writes, id ea0ab3f25bc17c26, 232509 bytes to 232509 bytes.

| Path | A | B |
|---|---|---|
| $.map.pins[72].lat | 13.018193137254903 | 13.016499019607844 |
| $.map.pins[72].lon | 80.21036896078431 | 80.21072974509804 |

### collector GET /api/collector/overview?period=weekly&zone=13

Session writes, id 3f54c3ecc14de285, 140493 bytes to 140493 bytes.

| Path | A | B |
|---|---|---|
| $.map.pins[23].lat | 13.018193137254903 | 13.016499019607844 |
| $.map.pins[23].lon | 80.21036896078431 | 80.21072974509804 |

