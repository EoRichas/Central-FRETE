import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateFleetFreightMetrics, DEFAULT_FLEET_PARAMETERS } from '../lib/domain/fleet.ts';
import { calculateMonthlyResult, type MonthlySource } from '../lib/domain/fleet-results.ts';

test('margem por veículo considera apenas comissão e despesas diretas', () => {
 const metrics = calculateFleetFreightMetrics({ distanceMeters:100000,freightAmountCents:100000,tollCents:10000,driverCommissionCents:10000,
   yardCostCents:5000,pickupCostCents:2000,deliveryCostCents:3000,otherCostCents:1000,actualFuelCostCents:20000 }, DEFAULT_FLEET_PARAMETERS,9999);
 assert.equal(metrics.directCostCents,21000); assert.equal(metrics.contributionCents,79000);
 assert.equal(metrics.totalCostCents,51000); assert.equal(metrics.netRevenueCents,49000);
 const grouped = calculateFleetFreightMetrics({ distanceMeters:100000,freightAmountCents:100000,tollCents:0,driverCommissionCents:10000,tripId:'trip' },DEFAULT_FLEET_PARAMETERS,9999);
 assert.equal(grouped.fuelCostCents,0); assert.equal(grouped.contributionCents,90000);
});
test('fechamento mantém prejuízo, competência sem fretes e zero realizado', () => {
 const empty: MonthlySource = { competency:'2026-11',freights:[],trips:[],entries:[],unbilledCount:0 };
 assert.equal(calculateMonthlyResult(empty).resultCents,0);
 assert.equal(calculateMonthlyResult({...empty,entries:[{id:'rent',kind:'FIXED',description:'Aluguel',amountCents:50000}]}).resultCents,-50000);
 assert.equal(calculateFleetFreightMetrics({distanceMeters:100000,freightAmountCents:1000,tollCents:0,driverCommissionCents:0,actualFuelCostCents:0},DEFAULT_FLEET_PARAMETERS,null).fuelCostCents,0);
 assert.throws(() => calculateMonthlyResult({...empty,entries:[{id:'a',kind:'REVENUE',description:'a',amountCents:Number.MAX_SAFE_INTEGER},{id:'b',kind:'REVENUE',description:'b',amountCents:1}]}), /precisão/);
});
