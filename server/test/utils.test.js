const { test } = require('node:test');
const assert = require('node:assert/strict');
const { documentoValido, periodoValido, calcularProximaExecucao } = require('../utils');

test('documentoValido aceita CPF valido', () => {
  assert.equal(documentoValido('529.982.247-25'), true);
});

test('documentoValido rejeita CPF com digito verificador errado', () => {
  assert.equal(documentoValido('529.982.247-26'), false);
});

test('documentoValido rejeita sequencia de digitos repetidos', () => {
  assert.equal(documentoValido('111.111.111-11'), false);
});

test('documentoValido aceita CNPJ valido', () => {
  assert.equal(documentoValido('11.222.333/0001-81'), true);
});

test('documentoValido rejeita CNPJ com digito verificador errado', () => {
  assert.equal(documentoValido('11.222.333/0001-82'), false);
});

test('documentoValido rejeita documento com tamanho invalido', () => {
  assert.equal(documentoValido('123456'), false);
});

test('documentoValido rejeita valor vazio', () => {
  assert.equal(documentoValido(''), false);
  assert.equal(documentoValido(undefined), false);
});

test('periodoValido aceita datas no formato AAAA-MM-DD', () => {
  assert.equal(periodoValido('2026-08-01', '2026-08-31'), true);
});

test('periodoValido rejeita formato brasileiro DD/MM/AAAA', () => {
  assert.equal(periodoValido('01/08/2026', '31/08/2026'), false);
});

test('periodoValido rejeita string vazia ou incompleta', () => {
  assert.equal(periodoValido('', '2026-08-31'), false);
  assert.equal(periodoValido('2026-08-01', ''), false);
});

test('calcularProximaExecucao agenda ainda hoje quando o horario nao passou', () => {
  const agora = new Date(2026, 7, 31, 10, 0, 0);
  const proxima = calcularProximaExecucao(12, 0, agora);
  assert.equal(proxima.getDate(), 31);
  assert.equal(proxima.getHours(), 12);
});

test('calcularProximaExecucao agenda para amanha quando o horario ja passou hoje', () => {
  const agora = new Date(2026, 7, 31, 13, 30, 0);
  const proxima = calcularProximaExecucao(12, 0, agora);
  assert.equal(proxima.getDate(), 1);
  assert.equal(proxima.getMonth(), 8);
});

test('calcularProximaExecucao agenda para amanha quando o horario e exatamente agora', () => {
  const agora = new Date(2026, 7, 31, 12, 0, 0);
  const proxima = calcularProximaExecucao(12, 0, agora);
  assert.equal(proxima.getDate(), 1);
});
