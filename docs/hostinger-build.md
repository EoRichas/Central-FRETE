# Build na Hostinger

Configuração: Next.js, Node 22.x, npm, diretório raiz `./`, comando
`npm run build`, diretório de saída `.next`.

O script `scripts/build.mjs` inicia o Next com Webpack e limita os pools nativos
Rayon e Tokio a uma thread cada **antes** de carregar o compilador.
`next.config.ts` limita a coleta/geração das páginas a dois workers.

Motivo: em hospedagem compartilhada, o processo pode enxergar dezenas de CPUs
da máquina física, mas ter uma cota pequena para processos/threads. O build
que tentou coletar dados com 63 workers falhou com:
`OS can't spawn worker thread: Resource temporarily unavailable (os error 11)`.

Não é preciso adicionar variáveis à Hostinger. Após integrar esta alteração,
refaça a implantação da main. O log deve mostrar `node scripts/build.mjs`,
Webpack e coleta/geração com dois workers, em vez de 63.

O limite reduz o pico de processos e pode aumentar o tempo de compilação.
Não altera o limite de usuários, conexões do banco nem o script de inicialização.
Se ainda falhar, use os logs dessa nova tentativa para distinguir falta de
memória, limites adicionais da hospedagem e erros na inicialização.
