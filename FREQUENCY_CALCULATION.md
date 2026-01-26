# How Hourly Frequency is Calculated

## Current Calculation Method

### Step 1: Extract Trip Departure Times
- Read `stop_times.txt` from GTFS feed
- For each trip, extract the **departure time of the first stop** (stop_sequence = 1)
- Convert time from "HH:MM:SS" format to seconds since midnight
- Handle times > 24 hours (next day) by normalizing: `hours >= 24 ? hours - 24 : hours`

### Step 2: Group Trips by Variant
- Match trips to variants using:
  - `route_id` (from trips.txt)
  - `direction_id` (0 or 1)
  - `route_variant` (if available)
- Each variant represents a unique route pattern/direction combination

### Step 3: Count Trips per Hour
For each variant:
- Create an array of 24 hours (0-23)
- For each trip's departure time, determine which hour it belongs to
- Increment the count for that hour
- Example: If 4 trips depart at 8:15 AM, 8:30 AM, 8:45 AM, and 8:50 AM, hour 8 gets a count of 4

### Step 4: Aggregate by Route (Frontend)
- Group all variants by `route_short_name`
- Sum up hourly frequencies across all variants for each route
- Calculate statistics:
  - **Total Trips**: Sum of all trips across all variants
  - **Peak Hour**: Hour with highest trip count
  - **Average Frequency**: Total trips / 24 hours
  - **Headways**: Time differences between consecutive trips

## Important Notes

### Service Days
⚠️ **Current behavior**: The calculation includes trips from **ALL service days** in the GTFS feed (weekday, Saturday, Sunday, etc.). This means:
- The frequency shown is the **sum across all service days**, not a single day
- If a route runs 4 times/hour on weekdays and 2 times/hour on weekends, you'll see 6 trips/hour in the graph
- This is why numbers might appear higher than expected

### Potential Improvements
1. **Filter by Service Day**: Use `calendar.txt` or `calendar_dates.txt` to filter trips by specific days
2. **Separate by Day Type**: Show separate frequencies for weekday vs weekend
3. **Weighted Average**: Calculate average frequency per service day type

## Example Calculation

### Why 186 trips at 5 AM for Route 25?

The frequency count includes:
1. **All Route Variants**: Route 25 might have multiple variants (25A, 25B, 25C) with different stop patterns
2. **Both Directions**: Each variant runs in both directions (0 and 1)
3. **All Service Days**: Weekday, Saturday, Sunday, and holiday schedules

**Breakdown Example:**
- Route 25 has 3 variants (25A, 25B, 25C)
- Each variant runs in 2 directions = 6 combinations
- Each combination runs on 3 service days (weekday, Saturday, Sunday)
- If each service day has ~10 trips at 5 AM per combination:
  - 6 combinations × 3 service days × 10 trips = **180 trips**
  - Plus additional trips from holidays/special service = **~186 trips**

### For Route 31 (Guelph/Toronto):
- Variant A (Direction 0): 1,042 trips total
- Variant B (Direction 1): 1,042 trips total
- **Total**: 2,084 trips across all service days

If these trips are distributed:
- 6 AM: 50 trips (Variant A) + 50 trips (Variant B) = 100 trips
- 7 AM: 75 trips (Variant A) + 75 trips (Variant B) = 150 trips
- 3 PM: 200 trips (Variant A) + 200 trips (Variant B) = 400 trips

The graph shows the aggregated count per hour across all variants and all service days.

## What This Means

**186 trips at 5 AM does NOT mean:**
- ❌ 186 buses running at 5 AM on a single day
- ❌ 186 trips per hour on a typical day

**186 trips at 5 AM DOES mean:**
- ✅ Total trips scheduled at 5 AM across all service days in the GTFS feed
- ✅ Sum of: (weekday trips) + (Saturday trips) + (Sunday trips) + (holiday trips)
- ✅ Across all route variants and both directions

To get a single-day frequency, you would divide by the number of service days. For example:
- If there are 3 service days (weekday, Saturday, Sunday)
- 186 trips ÷ 3 days ≈ **62 trips per day at 5 AM**
- But this is still across all variants and directions
