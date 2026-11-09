# Datas de criação nos relatórios

O cadastro e a edição de fretes da Frota e vendas da Cegonha têm o campo **Data de
criação**. O preenchimento aceita hoje ou uma data anterior, no fuso de São Paulo.
O sistema preserva o horário real de cadastro e registra alterações na auditoria.
A data de criação de uma venda espelhada é definida no frete Frota vinculado.

Os relatórios de vendas, prestadores, motoristas e veículos usam a data informada
para filtrar e ordenar os registros, do dia mais recente ao mais antigo. Dentro
de cada dia, as vendas aparecem pelo número original, do maior para o menor.
Assim, a venda 492 de um dia mais recente aparece antes da 495 de um dia anterior.
Quando não há uma data informada, vale o dia do cadastro real em São Paulo. As
exportações usam os mesmos filtros e a mesma ordem. O relatório de prestadores
permite selecionar um cliente ou consultar todos; o nome do prestador é opcional.

Coleta, entrega, data da venda, faturamento, pagamentos e apurações financeiras
continuam com suas datas próprias.

## Implantação

Execute a migração `database/018_report_creation_date.sql` pelo fluxo habitual
(`npm run migrate`) antes de publicar o código. Ela adiciona duas colunas
opcionais, sem reescrever os registros anteriores. Se for necessário voltar à
versão antiga da aplicação, as colunas podem permanecer: o código anterior não
depende delas.
