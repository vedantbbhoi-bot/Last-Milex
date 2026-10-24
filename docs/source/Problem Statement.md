# Problem Statement: The Last-Mile Spoilage Trap

## The Operational Crisis

Every night across major cities—and during urban emergencies like flash floods—hundreds of restaurants, hostel messes, and pharmacies attempt to donate untouched cooked food, short-life medical supplies, and essential kits to night shelters and relief camps. Despite having enough donors and volunteer two-wheeler riders, nearly **40% of perishable aid is wasted or causes harm** due to coordination blind spots.

## The Four Failure Modes

### 1. Bulk Supply vs. Fragmented Demand
A banquet hall may have **180 cooked meals that spoil in 75 minutes**. A single volunteer rider can only carry **40 meals on a scooter**. Shelter A has space for **50 people**. The mismatch between bulk supply, single-point demand, and transport capacity creates immediate spoilage risk.

### 2. The "Ghost Reservation" Trap
A volunteer claims a batch on their phone to reserve it, gets stuck in traffic, and goes unresponsive for 30 minutes. By the time they cancel, the food sits unclaimed at the donor’s gate with **only 15 minutes of safe shelf-life left**. No other rider can pick up and deliver before it turns unsafe. Well-meaning claims paralyze the network.

### 3. Mid-Journey Demand Collapse
A volunteer is halfway to Shelter A carrying 40 meals. A local citizen drops off food directly at Shelter A, **filling its requirement completely**. The incoming rider is stranded with ticking perishable cargo and **no fallback destination**. Ground conditions change mid-operation; the system must recover dynamically.

### 4. Dependency Violations
Some supplies have strict dependency rules. Dispatching **raw ration kits or infant formula** to a site that currently **lacks clean water or cooking fuel** is counterproductive—it consumes transport capacity and creates a second-order problem at the receiving end.

## The Three Native Primitives

### 1. Dynamic Batch Splitter & Constraint Matcher
Takes a total unit count, shelf-life, and dependency tags (e.g., `potable_water_required`), and **instantly fractures the load into sub-batches** respecting (a) the vehicle's fixed capacity (e.g., 40 units) and (b) the available shelter capacity at each destination. A single 180-meal batch becomes up to five sub-batches bound to specific riders and specific shelters—each with an individually enforced expiry clock.

### 2. Heartbeat & Dead-Man's Claim Timeout
A **time-decay reservation engine**. Every rider claim has a hard **5-minute confirmation timer** backed by a per-claim heartbeat. If the rider does not confirm pickup or stops sending heartbeats, the claim **auto-revokes and re-publishes without any human intervention**. No batch ever dies in a stale claim state.

### 3. Mid-Route Shelter Shock Rerouter
An **immediate fallback trigger**. The instant a shelter’s demand flips to `filled` while a rider is en route, the system recalculates the destination and **retargets the rider to the nearest unsaturated, compatible shelter that remains reachable within the batch's remaining shelf-life**. If no such shelter exists, the batch is explicitly flagged as `at_risk` so a human can intervene before spoilage.

## Target Outcome

A **production-ready**, real-time coordination platform with a live PostgreSQL backend, authenticated roles, and a fluid, intentional UI. All three primitives must be demonstrable under judge-driven failure injection.