function documentoValido(documento) {
  const numeros = String(documento || '').replace(/\D/g, '');

  if (/^(\d)\1+$/.test(numeros)) return false;

  if (numeros.length === 11) {
    const calcularDigito = (tamanho) => {
      let soma = 0;
      for (let indice = 0; indice < tamanho; indice++) {
        soma += Number(numeros[indice]) * (tamanho + 1 - indice);
      }
      const resto = (soma * 10) % 11;
      return resto === 10 ? 0 : resto;
    };
    return calcularDigito(9) === Number(numeros[9]) && calcularDigito(10) === Number(numeros[10]);
  }

  if (numeros.length === 14) {
    const pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const calcularDigito = (base, pesosUsados) => {
      const soma = base.split('').reduce((total, numero, indice) => total + Number(numero) * pesosUsados[indice], 0);
      const resto = soma % 11;
      return resto < 2 ? 0 : 11 - resto;
    };
    const primeiro = calcularDigito(numeros.slice(0, 12), pesos.slice(1));
    const segundo = calcularDigito(numeros.slice(0, 12) + primeiro, pesos);
    return primeiro === Number(numeros[12]) && segundo === Number(numeros[13]);
  }

  return false;
}

function periodoValido(inicio, fim) {
  return /^\d{4}-\d{2}-\d{2}$/.test(inicio) && /^\d{4}-\d{2}-\d{2}$/.test(fim);
}

function calcularProximaExecucao(hora, minuto, agora = new Date()) {
  const proxima = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), hora, minuto, 0, 0);
  if (proxima <= agora) {
    proxima.setDate(proxima.getDate() + 1);
  }
  return proxima;
}

module.exports = { documentoValido, periodoValido, calcularProximaExecucao };
