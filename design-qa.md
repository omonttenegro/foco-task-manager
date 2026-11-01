# Design QA — cartões do ecrã Hoje

## Referências

- Verdade visual: `/Users/andremontenegro/.codex/generated_images/01a1403d-5a23-7af0-aefe-92c9079b238e/exec-53bb01ca-ee4c-49cf-9314-6cfdeec4e7b6.png`
- Implementação: `/Users/andremontenegro/Documents/ToDo_app/implementation-overview-sidebar-continuous-mobile.png`
- Comparação lado a lado: `/Users/andremontenegro/Documents/ToDo_app/design-qa-sidebar-continuous-comparison.png`

## Condições da verificação

- Estado: modo claro rosa, sessão autenticada, página Hoje.
- Dados visíveis: 2 tarefas para hoje, 2 atrasadas e 0 urgentes.
- Viewport: emulação de iPhone 16, 393 × 852 CSS px.
- Referência: 853 × 1844 px, normalizada para 393 × 844 px e enquadrada em 393 × 852 px.
- Captura da implementação: conteúdo do dispositivo recortado de uma captura do Chrome com 2940 × 1670 px e normalizado para 393 × 852 px.
- A página estava ligeiramente deslocada para baixo na captura focada; o título da data permanece no DOM e fora da área visível do recorte.

## Comparação e resultados

- Os três estados usam agora a mesma estrutura, ritmo vertical e densidade.
- Hoje usa o destaque principal rosa; Atrasadas usa coral; Urgentes usa framboesa.
- A barra lateral de cada estado prolonga-se agora, sem interrupção, do respetivo cabeçalho até ao fim do conteúdo ou estado vazio.
- Os antigos textos explicativos foram removidos. Estados vazios mostram apenas ícone e contador visual, mantendo descrição acessível para leitores de ecrã.
- Foi preservado o tabuleiro exterior único da primeira opção escolhida. A diferença entre os três blocos é criada por cabeçalhos, contadores, ícones e barras laterais, sem quebrar a harmonia.
- Não existe overflow horizontal no viewport verificado e a navegação inferior continua totalmente visível.
- A hierarquia mantém o nome da tarefa como conteúdo principal e os metadados como informação secundária.
- Não existem imagens raster nem placeholders nesta área; os símbolos são ícones vetoriais.

## Interações e consola

- Os controlos das tarefas continuam presentes e com nomes acessíveis.
- Não foi concluída nenhuma tarefa durante a verificação para evitar alterar dados reais.
- Testes automatizados: 10 ficheiros, 42 testes aprovados.
- Build de produção concluído com sucesso.
- Erros de consola: nenhum. Existe um aviso pré-existente sem impacto nesta alteração.

## Histórico de correções

- A primeira captura revelou estilos antigos a interferir no bloco Atrasadas, incluindo rosa excessivo, brilho e rotação.
- Foram aplicados seletores específicos por variante e novos tokens coral/framboesa.
- A comparação final confirma consistência de espaçamento, contraste, alinhamento e diferenciação entre os três estados.
- Na iteração seguinte, a barra lateral que terminava no cabeçalho foi substituída por um elemento absoluto à altura total de cada secção. A nova captura confirma a continuidade da barra e a transição correta entre as três cores.

## Resultado final

passed

---

# Design QA — logótipo de arranque

## Referências

- Verdade visual: `/var/folders/4z/179kxg7j29b9jlqdz333s4y80000gn/T/TemporaryItems/NSIRD_screencaptureui_Pd072S/Captura de ecrã 2026-10-28, às 13.01.08.png`
- Implementação isolada: `/Users/andremontenegro/Documents/ToDo_app/implementation-launch-logo.png`
- Comparação conjunta: `/Users/andremontenegro/Documents/ToDo_app/design-qa-logo-comparison.png`
- Recurso principal: `/Users/andremontenegro/Documents/ToDo_app/public/icons/foco-gradient-1024.png`

## Condições da verificação

- Estado: identidade estática apresentada antes da aplicação abrir.
- Captura de origem: 256 × 414 px; região do símbolo: 88 × 88 px.
- Implementação: fonte raster 1024 × 1024 px, normalizada para 128 × 128 px sobre o mesmo fundo escuro.
- Comparação: dois painéis de 256 × 256 px, lado a lado, sem alteração de densidade dentro de cada painel.
- O símbolo interno da aplicação não foi alterado e continua a usar o `--primary` correspondente ao tema escolhido.

## Superfícies de fidelidade

- Tipografia: o recurso alterado não contém texto; o nome e `short_name` do manifesto permanecem inalterados.
- Espaçamento e ritmo: símbolo centrado e com a mesma proporção visual; o recorte arredondado continua a ser aplicado pelo sistema operativo.
- Cores: sequência rosa, violeta, azul e verde reproduzida a partir dos tokens já existentes na marca do projeto.
- Qualidade do recurso: PNG opaco em 1024, 512, 192, 180 e 64 px; sem halos transparentes e com asterisco branco nítido.
- Conteúdo: não foi acrescentada nem removida cópia da experiência de arranque.

## Comparação e resultados

- A comparação conjunta confirma a mesma direção cromática, posição, escala e contraste da referência.
- A referência completa não precisou de outra comparação focada: o logótipo isolado é toda a área alterada.
- Não existem diferenças P0, P1 ou P2.
- Diferenças residuais de antialiasing da captura original são aceitáveis e desaparecem nos tamanhos finais do sistema.

## Histórico de correções

- Primeira iteração: o asterisco ficou visualmente maior do que na referência.
- Correção: a extensão dos três traços foi reduzida, preservando a espessura e os terminais arredondados.
- Evidência pós-correção: `design-qa-logo-comparison.png` mostra escala equivalente nos dois painéis.

## Verificação técnica

- Manifesto e metatags apontam para nomes de ficheiro novos para evitar reutilização do ícone rosa em cache.
- O ícone de instalação, o ícone Apple e o favicon usam a nova identidade estática.
- O tema e o logótipo apresentados depois de abrir a aplicação continuam dinâmicos.

final result: passed
