# Como usar o CanarinhoLives

## Tela pública (`/`)

A tela principal exibe automaticamente todos os canais cadastrados que estão **ao vivo no momento**.

### Grade de transmissões

- Ao abrir a página, o app verifica cada canal cadastrado em segundo plano.
- Canais ao vivo aparecem na grade com player do YouTube.
- Canais offline ficam ocultos — aparecem assim que entrarem ao ar (verificação automática a cada 2 minutos).
- **Links diretos de vídeo** (cadastrados pelo admin com URL de live) aparecem imediatamente, sem aguardar detecção.
- A grade se ajusta automaticamente ao número de transmissões ativas (1, 2, 4, 6 streams etc.).

### Áudio

- Todos os players iniciam **mutados** para permitir que a página carregue sem conflito de áudio.
- Ao **clicar ou pressionar qualquer tecla** pela primeira vez, o áudio é ativado automaticamente no primeiro canal ao vivo da lista.

### Painel de canais (botão superior direito)

Clique no botão de lista para abrir o painel lateral com todos os canais cadastrados e seus status:

| Indicador | Significado |
|---|---|
| 🟢 verde | Ao vivo |
| ⚪ cinza | Sem transmissão |
| 🟡 amarelo | Verificando... |
| 🚫 | Oculto manualmente |

- **Clique em qualquer canal** para ocultar ou mostrar na grade.
- Canais ocultos manualmente ficam salvos no navegador (`localStorage`) e persistem entre sessões.
- **Botão ↻ Atualizar**: força nova verificação imediata de todos os canais offline e recarrega a lista do servidor.

---

## Painel de administração (`/ze`)

Acesso restrito: apenas quem tem a senha consegue salvar alterações.

### Cadastrar / editar canais

1. Acesse `/ze` no seu navegador.
2. Informe a **senha do painel** no campo superior.
3. Para cada canal, preencha:
   - **Nome do canal** — como vai aparecer na grade (ex: `Narrador Fulano`)
   - **Canal** — identificador do canal no YouTube (veja formatos aceitos abaixo)
4. Use **+ Adicionar canal** para incluir mais linhas.
5. Use **✕** na linha para remover um canal.
6. Clique em **Salvar e publicar** para gravar as alterações.

A tela pública atualiza a lista em até **30 segundos** (tempo de cache na borda).

### Formatos aceitos no campo "Canal"

**Identificador de canal** — o backend resolve automaticamente para o ID `UC...`:

| Formato | Exemplo |
|---|---|
| URL com @handle | `https://www.youtube.com/@canarinholives` |
| URL com ID do canal | `https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxxxx` |
| Só o @handle | `@canarinholives` |
| ID direto | `UCxxxxxxxxxxxxxxxxxxxxxxxx` |

**Link direto de uma live específica** — o tile aparece imediatamente na grade, sem detecção automática de status:

| Formato | Exemplo |
|---|---|
| URL padrão | `https://www.youtube.com/watch?v=abc12345678` |
| URL curta | `https://youtu.be/abc12345678` |
| URL de live | `https://www.youtube.com/live/abc12345678` |

> Diferente de canais (que somem quando ficam offline), tiles de link direto ficam visíveis até o admin removê-los do `/ze` ou ocultá-los manualmente na grade.

> **Canal com duas lives simultâneas?** Adicione uma linha para cada link de live. Como o YouTube não expõe múltiplas lives via embed de canal (sem API Key), a única forma confiável é apontar cada live pelo link direto.

### Botão ↻ Carregar atual

Descarta as edições não salvas e recarrega a lista atual do servidor.

---

## Observações

- **Canais vs. links diretos**: canais (`@handle`, `UC...`) entram e saem da grade automaticamente conforme ficam ao vivo ou offline. Links diretos de vídeo ficam sempre visíveis — o admin controla quando remover.
- **Canais sem transmissão ao vivo**: não consomem recursos na tela do espectador — o iframe de verificação é removido após detectar que o canal está offline. Re-teste automático a cada 2 minutos.
- **Chat em localhost**: o chat do YouTube só carrega no domínio de produção configurado no embed. Em desenvolvimento local o player funciona mas o chat pode não carregar.
- **Múltiplos espectadores**: a lista de canais é servida com cache na borda da Vercel; o app suporta muitos acessos simultâneos sem custo adicional no plano gratuito.
