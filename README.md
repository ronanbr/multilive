# CanarinhoLives 🐤

Assista várias transmissões do YouTube ao mesmo tempo, em grade automática. O app detecta quais canais estão ao vivo e exibe player + chat de cada um; canais offline somem sozinhos da tela.

- **`/`** — tela pública: grade dos canais ao vivo + chat. Esta é a URL para compartilhar.
- **`/ze`** — painel restrito (senha): cadastro e edição dos canais exibidos.

## Como funciona

- **Sem API Key do YouTube.** A detecção de "ao vivo" é feita no próprio navegador via YouTube Player API: cada canal recebe um iframe oculto; se o player iniciar (estado `playing` ou `buffering`), o canal é considerado ao vivo e aparece na grade.
- **Dois modos de entrada no `/ze`**: identificador de canal (`@handle`, `UC...`, URL de canal) ou link direto de vídeo (`watch?v=`, `youtu.be/`, `/live/`). Canais entram e saem da grade automaticamente; links diretos ficam sempre visíveis (o admin controla quando remover).
- **Re-teste automático** dos canais offline a cada 2 minutos, sem recarregar a página.
- A lista de canais fica em um **Vercel Blob** (`channels.json`); o painel `/ze` grava nela via `POST /api/save`.
- Players são embeds nativos do YouTube — carregam direto dos servidores deles.
- A resposta de `/api/channels` tem cache na borda (`s-maxage=30, stale-while-revalidate=60`), então aguenta muitos espectadores no plano gratuito da Vercel.

## Endpoints

| Rota | O quê |
|---|---|
| `GET /api/channels` | lista de canais cadastrados (usada pela tela pública e pelo `/ze`) |
| `POST /api/save` | grava a lista de canais (protegido por `ADMIN_PASSWORD`) |

## Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `ADMIN_PASSWORD` | senha do painel `/ze` |
| `BLOB_READ_WRITE_TOKEN` | acesso ao Vercel Blob (gerado ao criar o store) |

## Rodar / publicar

```bash
npm install
vercel dev        # local em http://localhost:3000
vercel --prod     # deploy para produção
```

> O chat do YouTube só carrega no domínio configurado no embed (`embed_domain`). Em produção funciona normalmente; em `localhost` o player toca mas o chat pode não carregar.

## Documentação de uso

Veja [COMO_USAR.md](./COMO_USAR.md) para instruções completas de uso do app e do painel de administração.
