# Golden-master diff: lane-d to lane-d2

Compared 3272 requests with 3272. **82 changed, 0 added, 0 removed.**

## What differs around the requests

- next_build_id: iYMZEWqEj358QYVEclcav to PLo21dsAFYYPI1mRTGu2-

## By route

| Route | Requests changed | Roles | Status changes | Most changed paths |
|---|---|---|---|---|
| /api/collector/list | 70 | collector | none | $.rows[*].overdue (725) |
| /api/collector/insights | 8 | collector | none | $.deptActions[*].followUps[*].overdue (11), $.briefing.attention[*].overdue (2) |
| /api/collector/thunai/agent/round | 3 | collector | none | $.result.stage.next[*].ids[*] (5), $.result.stage.blocks[*].rows[*].overdue (4), $.result.stage.takeaway.en (3), $.result.stage.takeaway.ta (3), $.result.stage.say.en (3) |
| /api/map/send | 1 | collector | none | $.drafts[*].body (1) |

## Each changed request

### collector GET /api/collector/list

Session reads, id 92c0f3216614a7bd, 16292 bytes to 16484 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?cat=SOLID_WASTE

Session reads, id 316d433d2d5fe910, 16301 bytes to 16493 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?cat=DARK_SPOT_SAFETY

Session reads, id 4a1d78c14c209afb, 2841 bytes to 2873 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |

### collector GET /api/collector/list?cat=FOOD_SAFETY

Session reads, id a59eb3d669447d50, 2816 bytes to 2848 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |

### collector GET /api/collector/list?cat=PUBLIC_ORDER

Session reads, id bb0dd24b6b45180e, 7610 bytes to 7706 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |

### collector GET /api/collector/list?cat=FLOOD_RELIEF

Session reads, id 68be18beff790611, 4109 bytes to 4157 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |

### collector GET /api/collector/list?dept=GCC-SWM

Session reads, id 2bb93857a493d6c0, 16463 bytes to 16655 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?dept=GCC-ELE

Session reads, id 4bd160d801037be8, 17688 bytes to 17880 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?dept=POL-GCP

Session reads, id e012e5214733f5c8, 14907 bytes to 15099 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?dept=not+a+dept

Session reads, id 64f7392c82bb56d6, 16292 bytes to 16484 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?dir=1

Session reads, id 7e9a2e8dfaee6ea1, 16854 bytes to 17045 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | true |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?page=1

Session reads, id cb79a42eee05dd02, 16538 bytes to 16730 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?period=daily

Session reads, id bf89cf4f65c26ff3, 16292 bytes to 16484 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?period=weekly

Session reads, id 3dc78319781759f5, 16294 bytes to 16486 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?period=monthly

Session reads, id 73e18d7c81ae0c7d, 16295 bytes to 16487 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?period=quarterly

Session reads, id d3be032ceed0cb71, 16297 bytes to 16489 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?period=bogus

Session reads, id c9cde797d32f826b, 16292 bytes to 16484 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?place=unlocated

Session reads, id 85552d7278baa875, 6167 bytes to 6247 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |

### collector GET /api/collector/list?place=nozone

Session reads, id 8f74daca77a1af6f, 3695 bytes to 3743 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |

### collector GET /api/collector/list?place=notaluk

Session reads, id b2cd6b30ead4a988, 3695 bytes to 3743 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |

### collector GET /api/collector/list?q=Adyar

Session reads, id 3c2f891f388dbd39, 16274 bytes to 16466 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?q=garbage

Session reads, id 598d1f85747dd279, 16301 bytes to 16493 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?q=kuppai

Session reads, id 1b0fa387504c0f23, 4158 bytes to 4206 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |

### collector GET /api/collector/list?scope=all

Session reads, id b5fc96e7e9b58a3b, 16298 bytes to 16490 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?scope=30d

Session reads, id a7a3af80f3730fbf, 16295 bytes to 16487 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?sev=Severe

Session reads, id 71207e97504b091d, 13297 bytes to 13432 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | true |
| $.rows[1].overdue | (absent) | true |
| $.rows[2].overdue | (absent) | true |
| $.rows[3].overdue | (absent) | true |
| $.rows[4].overdue | (absent) | true |
| $.rows[5].overdue | (absent) | true |
| $.rows[6].overdue | (absent) | true |
| $.rows[7].overdue | (absent) | true |

...and 1 more paths (see the JSON file).

### collector GET /api/collector/list?sev=High

Session reads, id 5a015025073f2be2, 15595 bytes to 15787 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?sev=Medium

Session reads, id 06f7a814e9b313fe, 16656 bytes to 16848 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?sev=Low

Session reads, id c1e487225451d842, 16163 bytes to 16355 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?sev=bogus

Session reads, id 13093d57a1113c1f, 16292 bytes to 16484 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?sort=sev

Session reads, id ea66ca791f752577, 16166 bytes to 16358 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?sort=c

Session reads, id b1a12289ae303cdd, 17219 bytes to 17410 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | true |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?sort=r

Session reads, id 562a3a76481eb0a0, 16099 bytes to 16291 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?sort=d

Session reads, id 6cd5b11c893dd3c8, 17691 bytes to 17883 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?status=open

Session reads, id b790513fbc8014b2, 16292 bytes to 16484 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?status=unverified

Session reads, id dce8008690f770eb, 16587 bytes to 16779 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?status=verified

Session reads, id 7410c49dd3e4c6e4, 14976 bytes to 15168 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?status=critical

Session reads, id fb9bb38951c11ca3, 5999 bytes to 6059 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | true |
| $.rows[1].overdue | (absent) | true |
| $.rows[2].overdue | (absent) | true |
| $.rows[3].overdue | (absent) | true |

### collector GET /api/collector/list?status=overdue

Session reads, id d3ab709c8bb22c07, 15852 bytes to 16032 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | true |
| $.rows[1].overdue | (absent) | true |
| $.rows[2].overdue | (absent) | true |
| $.rows[3].overdue | (absent) | true |
| $.rows[4].overdue | (absent) | true |
| $.rows[5].overdue | (absent) | true |
| $.rows[6].overdue | (absent) | true |
| $.rows[7].overdue | (absent) | true |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?status=Open

Session reads, id 02c0953b05797381, 15527 bytes to 15719 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?status=Under+review

Session reads, id 2551c4cc475b8fce, 17263 bytes to 17455 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?status=Assigned

Session reads, id 9ae0e7c672fece3d, 16181 bytes to 16373 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?status=In+progress

Session reads, id 3d8b428b7d3ce1ff, 16046 bytes to 16237 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | true |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?status=Resolved

Session reads, id 2729d06095cb563f, 15965 bytes to 16154 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | true |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?status=bogus

Session reads, id 064e0fa86266673a, 16292 bytes to 16484 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?taluk=TLK-MYL

Session reads, id 0c9e21ba4606c68a, 16892 bytes to 17083 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | true |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?taluk=TLK-SHN

Session reads, id 64a695da27549caa, 13959 bytes to 14117 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | true |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 2 more paths (see the JSON file).

### collector GET /api/collector/list?taluk=TLK-MDR

Session reads, id e29402db83336acb, 16200 bytes to 16392 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?taluk=TLK-AYN

Session reads, id b2f3480db7448ae6, 12278 bytes to 12422 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 1 more paths (see the JSON file).

### collector GET /api/collector/list?zone=5

Session reads, id 9040397c6ff0d296, 16567 bytes to 16759 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?zone=13

Session reads, id c9be462ce57fca6a, 16385 bytes to 16577 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?zone=1

Session reads, id 7e54b0adc5291374, 7949 bytes to 8044 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | true |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |

### collector GET /api/collector/list?zone=8

Session reads, id ee020434b2ab372b, 15392 bytes to 15582 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?zone=15

Session reads, id 7c823a43ebed5df5, 11220 bytes to 11346 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | true |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | true |
| $.rows[7].overdue | (absent) | false |

### collector GET /api/collector/list?zone=99

Session reads, id 2c29acd576a08d35, 16292 bytes to 16484 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?zone=abc

Session reads, id d70aaf11e5e24e5a, 16292 bytes to 16484 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?period=weekly&zone=5

Session reads, id af22c0709a6e3bc1, 16393 bytes to 16584 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?period=monthly&zone=13

Session reads, id 9529f03f08f59914, 16235 bytes to 16427 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?period=quarterly&zone=1

Session reads, id 32780888e1c643bb, 15759 bytes to 15947 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | true |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | true |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?period=weekly&dept=GCC-SWM

Session reads, id 3f2d0e9d6219ec8e, 16473 bytes to 16665 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?period=monthly&dept=CMWSSB

Session reads, id 0a65504cd8363dcc, 15008 bytes to 15188 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | true |
| $.rows[1].overdue | (absent) | true |
| $.rows[2].overdue | (absent) | true |
| $.rows[3].overdue | (absent) | true |
| $.rows[4].overdue | (absent) | true |
| $.rows[5].overdue | (absent) | true |
| $.rows[6].overdue | (absent) | true |
| $.rows[7].overdue | (absent) | true |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?period=monthly&zone=13&cat=SOLID_WASTE

Session reads, id 683e1235e2906431, 16606 bytes to 16789 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | true |
| $.rows[2].overdue | (absent) | true |
| $.rows[3].overdue | (absent) | true |
| $.rows[4].overdue | (absent) | true |
| $.rows[5].overdue | (absent) | true |
| $.rows[6].overdue | (absent) | true |
| $.rows[7].overdue | (absent) | true |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?period=weekly&taluk=TLK-MYL

Session reads, id c2cc223f0d117bd9, 16783 bytes to 16974 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | true |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?dept=GCC-SWM&taluk=TLK-MYL

Session reads, id 21df7383258658e3, 4066 bytes to 4114 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |

### collector GET /api/collector/list?period=quarterly&zone=5&dept=GCC-SWM&cat=SOLID_WASTE

Session reads, id 4e9af0efec8089ab, 16379 bytes to 16567 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | true |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | true |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?period=weekly&cat=DARK_SPOT_SAFETY&sev=High

Session reads, id 4ff34bdbd93a1f31, 1532 bytes to 1547 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | true |

### collector GET /api/collector/list?period=monthly&zone=5&status=open

Session reads, id 4c3823598613c9d2, 16394 bytes to 16585 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?period=quarterly&sev=Severe&status=overdue

Session reads, id a4a4658926d8a105, 18625 bytes to 18805 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | true |
| $.rows[1].overdue | (absent) | true |
| $.rows[2].overdue | (absent) | true |
| $.rows[3].overdue | (absent) | true |
| $.rows[4].overdue | (absent) | true |
| $.rows[5].overdue | (absent) | true |
| $.rows[6].overdue | (absent) | true |
| $.rows[7].overdue | (absent) | true |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/insights

Session reads2, id efa12c9a2336cbb1, 184967 bytes to 184966 bytes.

| Path | A | B |
|---|---|---|
| $.deptActions[0].followUps[2].overdue | false | true |

### collector GET /api/collector/insights?part=briefing

Session reads2, id 23c9e93c54bea3e0, 164519 bytes to 164518 bytes.

| Path | A | B |
|---|---|---|
| $.deptActions[0].followUps[2].overdue | false | true |

### collector GET /api/collector/insights?part=bogus

Session reads2, id e68c97b03cf9aeda, 184967 bytes to 184966 bytes.

| Path | A | B |
|---|---|---|
| $.deptActions[0].followUps[2].overdue | false | true |

### collector GET /api/collector/insights?period=daily

Session reads2, id 3918cee750c27772, 184967 bytes to 184966 bytes.

| Path | A | B |
|---|---|---|
| $.deptActions[0].followUps[2].overdue | false | true |

### collector GET /api/collector/insights?taluk=TLK-MYL

Session reads2, id a69318590c466904, 136278 bytes to 136276 bytes.

| Path | A | B |
|---|---|---|
| $.deptActions[0].followUps[1].overdue | false | true |
| $.deptActions[0].followUps[2].overdue | false | true |

### collector GET /api/collector/insights?zone=13

Session reads2, id c97a3f9d553bab49, 135908 bytes to 135906 bytes.

| Path | A | B |
|---|---|---|
| $.briefing.attention[2].overdue | false | true |
| $.deptActions[1].followUps[0].overdue | false | true |

### collector GET /api/collector/insights?zone=1

Session reads2, id f8b54a16fd2ba1e7, 126021 bytes to 126019 bytes.

| Path | A | B |
|---|---|---|
| $.briefing.attention[0].overdue | false | true |
| $.deptActions[0].followUps[0].overdue | false | true |

### collector GET /api/collector/insights?period=quarterly&zone=1

Session reads2, id ef53ddd2fe4a4b2f, 169942 bytes to 169939 bytes.

| Path | A | B |
|---|---|---|
| $.deptActions[0].followUps[0].overdue | false | true |
| $.deptActions[0].followUps[1].overdue | false | true |
| $.deptActions[0].followUps[2].overdue | false | true |

### collector POST /api/map/send (plan of sentence 1)

Session ask, id 688942c0db7068e8, 13268 bytes to 13553 bytes.

| Path | A | B |
|---|---|---|
| $.drafts[1].body | Dear Department officer,  The Collector's map shows 21 open cases for Greater Chennai Police that match "Which zone has the most severe inci... (3215 chars) | Dear Department officer,  The Collector's map shows 21 open cases for Greater Chennai Police that match "Which zone has the most severe inci... (3500 chars) |

### collector POST /api/collector/thunai/agent/round

Session ask, id ac136777a4aee429, 12427 bytes to 12581 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.en | 1 of the 12 shown is past its deadline. | 2 of the 12 shown are past their deadline. |
| $.result.stage.takeaway.ta | காட்டப்பட்ட 12-இல் 1 காலக்கெடுவைத் தாண்டியவை. | காட்டப்பட்ட 12-இல் 2 காலக்கெடுவைத் தாண்டியவை. |
| $.result.stage.say.en | 23 cases today; here are the 12 that matter most. One is past its deadline and needs you first: standing water at Saidapet (Adyar River - Sa... (234 chars) | 23 cases today; here are the 12 that matter most. 2 are past their deadline and need you first: standing water at Saidapet (Adyar River - Sa... (280 chars) |
| $.result.stage.say.ta | இன்று 23 சம்பவங்கள். 1 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: standing water at Saidapet (Adyar River - Saidapet stretch). PWD Wate... (206 chars) | இன்று 23 சம்பவங்கள். 2 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: standing water at Saidapet (Adyar River - Saidapet stretch), Road acc... (248 chars) |
| $.result.stage.blocks[0].items[1].value | 1 | 2 |
| $.result.stage.blocks[1].rows[1].overdue | false | true |
| $.result.stage.next[0].label.en | Draft for the 1 past deadline | Draft for the 2 past deadline |
| $.result.stage.next[0].label.ta | காலக்கெடு தாண்டிய 1-க்கு வரைவு | காலக்கெடு தாண்டிய 2-க்கு வரைவு |

...and 3 more paths (see the JSON file).

### collector POST /api/collector/thunai/agent/round

Session ask, id fa394469d1d31521, 11196 bytes to 11194 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.en | 6 of the 12 shown are past their deadline. | 8 of the 12 shown are past their deadline. |
| $.result.stage.takeaway.ta | காட்டப்பட்ட 12-இல் 6 காலக்கெடுவைத் தாண்டியவை. | காட்டப்பட்ட 12-இல் 8 காலக்கெடுவைத் தாண்டியவை. |
| $.result.stage.say.en | 105 cases this week; here are the 12 that matter most. 6 are past their deadline and need you first: standing water at Saidapet (Adyar River... (284 chars) | 105 cases this week; here are the 12 that matter most. 8 are past their deadline and need you first: standing water at Saidapet (Adyar River... (284 chars) |
| $.result.stage.say.ta | இந்த வாரம் 105 சம்பவங்கள். 6 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: standing water at Saidapet (Adyar River - Saidapet stretch), st... (253 chars) | இந்த வாரம் 105 சம்பவங்கள். 8 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: standing water at Saidapet (Adyar River - Saidapet stretch), st... (253 chars) |
| $.result.stage.blocks[0].items[1].value | 6 | 8 |
| $.result.stage.blocks[1].rows[2].overdue | false | true |
| $.result.stage.blocks[1].rows[4].overdue | false | true |
| $.result.stage.next[0].label.en | Draft for the 6 past deadline | Draft for the 8 past deadline |

...and 5 more paths (see the JSON file).

### collector POST /api/collector/thunai/agent/round (direct, sentence 17)

Session ask, id ef7c2b826ce05b4d, 12343 bytes to 12497 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.en | 1 of the 12 shown is past its deadline. | 2 of the 12 shown are past their deadline. |
| $.result.stage.takeaway.ta | காட்டப்பட்ட 12-இல் 1 காலக்கெடுவைத் தாண்டியவை. | காட்டப்பட்ட 12-இல் 2 காலக்கெடுவைத் தாண்டியவை. |
| $.result.stage.say.en | 23 cases today; here are the 12 that matter most. One is past its deadline and needs you first: standing water at Saidapet (Adyar River - Sa... (234 chars) | 23 cases today; here are the 12 that matter most. 2 are past their deadline and need you first: standing water at Saidapet (Adyar River - Sa... (280 chars) |
| $.result.stage.say.ta | இன்று 23 சம்பவங்கள். 1 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: standing water at Saidapet (Adyar River - Saidapet stretch). PWD Wate... (206 chars) | இன்று 23 சம்பவங்கள். 2 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: standing water at Saidapet (Adyar River - Saidapet stretch), Road acc... (248 chars) |
| $.result.stage.blocks[0].items[1].value | 1 | 2 |
| $.result.stage.blocks[1].rows[1].overdue | false | true |
| $.result.stage.next[0].label.en | Draft for the 1 past deadline | Draft for the 2 past deadline |
| $.result.stage.next[0].label.ta | காலக்கெடு தாண்டிய 1-க்கு வரைவு | காலக்கெடு தாண்டிய 2-க்கு வரைவு |

...and 3 more paths (see the JSON file).

### collector GET /api/collector/list

Session writes, id 5fe0b0ed335c49e4, 16292 bytes to 16484 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

### collector GET /api/collector/list?status=verified&period=quarterly

Session writes, id 50228dd8087cb116, 14981 bytes to 15173 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].overdue | (absent) | false |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].overdue | (absent) | false |

...and 4 more paths (see the JSON file).

