# 🔔 Painel de Push — Protótipo de Notificações Mobile

> **Autores:** Arthur Benevides (`082230016`) • Juan Pavani (`081240043`)

![React Native](https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Expo](https://img.shields.io/badge/Expo-000020?style=for-the-badge&logo=expo&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Android](https://img.shields.io/badge/Android-3DDC84?style=for-the-badge&logo=android&logoColor=white)

Protótipo mobile desenvolvido em **React Native + Expo** para demonstrar, na prática, diferentes estratégias de **notificações push (simuladas localmente)**, agendamento, cancelamento inteligente e **navegação contextual ao tocar na notificação** (*deep linking* interno).

---

## 🎯 Funcionalidades Demonstradas

O aplicativo é dividido em **3 abas**, cada uma representando um caso de uso real de mercado:

| Aba | Cenário de Uso | Comportamento da Notificação | Ação ao Tocar no Push |
| :--- | :--- | :--- | :--- |
| 💸 **Pix** | Confirmação transacional | Dispara **1 segundo** após validar valor, chave e senha (`123456`). | Direciona para a aba **Pix**. |
| 🛒 **Carrinho** | Recuperação de carrinho abandonado | Ao sair da aba com itens no carrinho, agenda push para **3 segundos**. Se o usuário voltar antes, o push é **cancelado**. | Volta para o **Carrinho** e aplica **10% de desconto** no último item adicionado. |
| 🍔 **Pedido** | Atualização de status (Delivery) | Ao fazer um pedido, cria o item como *"Aguardando"* e agenda push + mudança para *"Em preparo 👨‍🍳"* após **10 segundos**. | Direciona para a aba **Pedido**. |

---

## 🔄 Fluxo das Notificações (Arquitetura)

```mermaid
flowchart TD
    A[Início do App] --> B[setupNotifications]
    B --> C{Permissão concedida?}
    C -- Não --> D[Exibe banner de alerta amarelo]
    C -- Sim --> E[App pronto para disparar pushes]

    E --> F[💸 Aba Pix: Envio validado] -->|Delay 1s| N[Notificação Local]
    E --> G[🛒 Aba Carrinho: Saiu com itens] -->|Delay 3s| N
    G -.->|Voltou antes de 3s| X[Cancela notificação agendada]
    E --> H[🍔 Aba Pedido: Novo pedido] -->|Delay 10s| N

    N --> T[Usuário toca na notificação]
    T --> R[useLastNotificationResponse lê 'data.type']
    R -->|pix| P1[Abre aba Pix]
    R -->|abandoned_cart| P2[Abre Carrinho + 10% OFF no produto]
    R -->|order| P3[Abre aba Pedidos]
```

---

## 🛠️ Tecnologias Utilizadas

- **React Native**: Framework para construção de interfaces mobile nativas com JavaScript/React.
- **Expo**: Ecossistema que simplifica o desenvolvimento, compilação nativa (**Development Build**) e execução em emuladores (Android Studio / Pixel) e dispositivos físicos.
- **`expo-notifications`**: Biblioteca responsável por:
  - Criar canais de notificação no Android (`setNotificationChannelAsync` com importância `MAX` para exibir *heads-up banner* e vibração).
  - Solicitar e verificar permissões do sistema operacional (`getPermissionsAsync` / `requestPermissionsAsync`).
  - Agendar e cancelar notificações (`scheduleNotificationAsync` / `cancelScheduledNotificationAsync`).
  - Capturar o clique do usuário na notificação (`useLastNotificationResponse`).
- **React Hooks (`useState`, `useEffect`, `useRef`)**: Gerenciamento de estado das abas, carrinho, pedidos, controle de troca de tela e armazenamento de IDs de notificações agendadas sem causar re-renderizações desnecessárias.

---

## 🚀 Como Executar o Projeto

### Pré-requisitos
- [Node.js](https://nodejs.org/) instalado.
- **Android Studio** com um emulador Android configurado (ex: Pixel 5 — API 34) e variáveis de ambiente `JAVA_HOME` e `ANDROID_HOME` configuradas no terminal.

### Passo a passo (Development Build)
1. Instale as dependências do projeto:
   ```bash
   npm install
   ```
2. Compile e instale o build nativo no emulador Android (necessário apenas na primeira execução ou ao alterar dependências nativas):
   ```bash
   npx expo run:android
   ```
3. Nas próximas execuções (com o app já instalado no emulador), basta iniciar o servidor de desenvolvimento:
   ```bash
   npx expo start --dev-client
   ```

> 💡 **Por que Development Build em vez de Expo Go?**  
> A partir do Expo SDK 53, o Expo Go possui restrições no Android para o módulo `expo-notifications` (como criação de canais e abertura do app via toque na notificação quando fechado). Usar `npx expo run:android` gera o APK nativo do projeto, garantindo funcionamento completo.

> ⚠️ **Atenção no Android 13+ / Emulador Pixel:**  
> Caso as notificações não apareçam, acesse **Configurações do aparelho > Apps > [Nome do App] > Notificações** e verifique se a permissão está ativada.

---

## 🎤 Roteiro Rápido de Demonstração (Apresentação)

1. **Aba Pix**: Preencha um valor (ex: `50,00`), uma chave qualquer e a senha **`123456`**. Clique em *Enviar Pix* e observe a notificação chegar em **1s**.
2. **Aba Carrinho (Cancelamento)**: Adicione um produto, troque de aba e **volte rapidamente (antes de 3s)** — mostre que o push foi cancelado.
3. **Aba Carrinho (Conversão com Desconto)**: Troque de aba novamente e **aguarde 3s**. Quando o push chegar, **toque nele**: o app retorna automaticamente ao carrinho com o banner de **10% OFF** aplicado ao produto.
4. **Aba Pedido**: Clique em *Pedir* em qualquer item do cardápio. Mostre o status inicial (*"Aguardando"*) e, após **10s**, veja a notificação chegar sincronizada com a atualização para *"Em preparo 👨‍🍳"*.

---

## ⚙️ Parâmetros Configuráveis no Código

No topo do arquivo `App.js`, é possível ajustar facilmente os tempos e regras de negócio para testes:

```javascript
const PIX_PASSWORD = '123456'; // Senha fixa para validação do Pix
const CART_DISCOUNT = 0.1;     // Percentual de desconto (0.1 = 10%)
const ABANDON_DELAY_S = 3;     // Tempo (em segundos) para push de carrinho abandonado
const ORDER_DELAY_S = 10;      // Tempo (em segundos) para mudança de status do pedido
```
