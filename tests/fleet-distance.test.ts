import assert from 'node:assert/strict';
import {test} from 'node:test';
import {effectiveFleetDistance} from '../lib/domain/fleet-distance.ts';
import {calculateFleetFreightMetrics} from '../lib/domain/fleet.ts';
test('hodômetro prevalece sobre rota; zero, leitura parcial e distância manual continuam válidos',()=>{
 assert.equal(effectiveFleetDistance({distanceMeters:510000,routeDistanceMeters:510000,odometerStartMeters:125300000,odometerEndMeters:125795000}),495000);
 assert.equal(effectiveFleetDistance({distanceMeters:510000,odometerStartMeters:0,odometerEndMeters:0}),0);
 assert.equal(effectiveFleetDistance({distanceMeters:480000,routeDistanceMeters:510000,odometerStartMeters:1000}),480000);
 for (const value of [NaN,Infinity,-1,1.2,1e16]) assert.throws(()=>effectiveFleetDistance({distanceMeters:1000,odometerStartMeters:value}));
 assert.throws(()=>effectiveFleetDistance({distanceMeters:1000,odometerStartMeters:100,odometerEndMeters:99}),/menor/);
});
test('margem inclui todos os custos efetivos, sem descontar histórico mensal do veículo',()=>{
 const metrics=calculateFleetFreightMetrics({distanceMeters:495000,freightAmountCents:500000,actualFuelCostCents:100000,tollCents:30000,driverCommissionCents:40000,otherCostCents:20000},{fuelPriceCents:738,averageConsumptionMilliKmPerLiter:3200},900);
 assert.equal(metrics.totalCostCents,190000);assert.equal(metrics.netRevenueCents,310000);assert.equal(metrics.marginBasisPoints,6200);
});
