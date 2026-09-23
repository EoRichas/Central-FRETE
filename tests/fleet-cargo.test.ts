import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateTripCost } from '../lib/domain/trip-allocation.ts';
import { fuelInputToInteger } from '../lib/domain/fuel-input.ts';
import { cargoVehiclesOrLegacy } from '../lib/domain/cargo-vehicles.ts';

test('combustível aceita decimais sem arredondar ou substituir o valor pago',()=>{
 assert.equal(fuelInputToInteger('5,79','Bomba',2),579);
 assert.equal(fuelInputToInteger('5.79','Bomba',2),579);
 assert.equal(fuelInputToInteger('123,456','Litros',3),123456);
 assert.equal(fuelInputToInteger('1.234,56','Pago',2),123456);
 assert.equal(fuelInputToInteger('0','Pago',2),0);
 assert.equal(fuelInputToInteger('','Pago',2),null);
 assert.throws(()=>fuelInputToInteger('5,799','Bomba',2),/casas/);
 assert.throws(()=>fuelInputToInteger('-1','Pago',2));
});
test('rateio histórico preserva centavos e ordem determinística',()=>{
 const ids=['c','a','b'];
 assert.deepEqual(ids.map(id=>allocateTripCost(100,ids,id)),[33,34,33]);
 assert.equal(ids.reduce((sum,id)=>sum+allocateTripCost(101,ids,id),0),101);
 assert.equal(allocateTripCost(100,[], 'a'),0);
});
test('uma unidade legada continua consultável sem novos campos',()=>{
 assert.deepEqual(cargoVehiclesOrLegacy(null,'MODELO','ABC1D23'),[{model:'MODELO',plate:'ABC1D23',identification:null}]);
 assert.equal(cargoVehiclesOrLegacy(null,null,null).length,1);
});
