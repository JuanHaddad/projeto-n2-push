import React, { useEffect, useRef, useState } from 'react';
import {
  Platform,
  StatusBar,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import * as Notifications from 'expo-notifications';

// ---------------------------------------------------------------------------
// 1. CONFIGURAÇÕES GLOBAIS E DADOS MOCKADOS DO PROTÓTIPO
// Centralizar essas constantes facilita alterar regras durante a apresentação.
// ---------------------------------------------------------------------------
const PIX_PASSWORD = '123456'; // Senha fixa para simular autenticação bancária
const CART_DISCOUNT = 0.1;     // 10% de desconto concedido ao clicar no push de carrinho abandonado
const ABANDON_DELAY_S = 3;     // Tempo (segundos) após sair do carrinho para disparar o lembrete
const ORDER_DELAY_S = 10;      // Tempo (segundos) para simular a cozinha iniciando o preparo
const CHANNEL = 'default';     // ID do canal de notificação exigido pelo Android (API 26+)

// Lista estática de produtos da aba Carrinho
const PRODUCTS = [
  { id: 'p1', name: 'Fone Bluetooth', price: 199.9 },
  { id: 'p2', name: 'Teclado Mecânico', price: 349.9 },
  { id: 'p3', name: 'Mouse Gamer', price: 129.9 },
  { id: 'p4', name: 'Mochila Executiva', price: 159.0 },
];

// Lista estática de itens do cardápio da aba Pedido
const MENU = [
  { id: 'l1', name: 'X-Burger', emoji: '🍔', price: 24.9 },
  { id: 'l2', name: 'Hot Dog Completo', emoji: '🌭', price: 16.5 },
  { id: 'l3', name: 'Pizza (fatia)', emoji: '🍕', price: 12.0 },
  { id: 'l4', name: 'Batata Frita', emoji: '🍟', price: 14.0 },
];

// Função utilitária para formatar números no padrão monetário brasileiro (R$ 0,00)
const brl = (n) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ---------------------------------------------------------------------------
// 2. CAMADA DE NOTIFICAÇÕES (Locais, simulando comportamento de Push)
// ---------------------------------------------------------------------------

/**
 * Define como o app deve se comportar quando uma notificação chega
 * enquanto o aplicativo está aberto em primeiro plano (foreground).
 * Sem isso, o sistema operacional costuma esconder o banner quando o app está em uso.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,   // Exibe alerta visual (compatibilidade)
    shouldShowBanner: true,  // Exibe o banner flutuante no topo da tela
    shouldShowList: true,    // Mantém a notificação na central de notificações
    shouldPlaySound: true,   // Toca o som padrão de notificação
    shouldSetBadge: false,   // Não altera o contador numérico no ícone do app
  }),
});

/**
 * Configura o canal de notificação (Android) e solicita permissão ao usuário.
 * Retorna `true` se as notificações estiverem liberadas, ou `false` caso contrário.
 */
async function setupNotifications() {
  try {
    // No Android 8+, notificações precisam pertencer a um canal configurado.
    // Importance.MAX garante que a notificação apareça como pop-up (heads-up) com som/vibração.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Padrão',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250], // Padrão de vibração em ms
      });
    }

    // Verifica se o usuário já concedeu permissão anteriormente
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return true;

    // Se ainda não concedeu, solicita a permissão nativa (obrigatório no Android 13+ e iOS)
    const req = await Notifications.requestPermissionsAsync();
    return req.status === 'granted';
  } catch (e) {
    // Protege o app contra falhas nativas (ex: durante reloads no emulador)
    console.warn('Erro ao configurar notificações:', e);
    return false;
  }
}

/**
 * Agenda ou dispara imediatamente uma notificação local.
 * @param {string} title   - Título exibido em destaque na notificação
 * @param {string} body    - Mensagem detalhada
 * @param {object} data    - Payload invisível enviado junto (usado ao clicar no push)
 * @param {number} seconds - Atraso em segundos (0 = disparo imediato)
 * @returns {Promise<string>} ID único da notificação agendada (útil para cancelar depois)
 */
function sendPush({ title, body, data = {}, seconds = 0 }) {
  // Se seconds === 0, dispara imediatamente (no Android informa o canal)
  let trigger = Platform.OS === 'android' ? { channelId: CHANNEL } : null;

  // Se houver atraso, configura um gatilho baseado em intervalo de tempo
  if (seconds > 0) {
    trigger = {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      channelId: CHANNEL,
    };
  }

  return Notifications.scheduleNotificationAsync({
    content: { title, body, data, sound: true },
    trigger,
  });
}

// ---------------------------------------------------------------------------
// 3. COMPONENTE PRINCIPAL (App com navegação por 3 abas)
// ---------------------------------------------------------------------------
export default function App() {
  // Estados principais da aplicação
  const [tab, setTab] = useState('pix');             // Aba ativa: 'pix' | 'cart' | 'orders'
  const [pushOk, setPushOk] = useState(true);        // Controla exibição do banner de permissão negada
  const [cart, setCart] = useState([]);              // Lista de itens no carrinho
  const [discountId, setDiscountId] = useState(null);// ID do produto que ganhou 10% OFF via push
  const [orders, setOrders] = useState([]);          // Histórico de pedidos realizados na aba Pedido

  // Refs guardam valores entre renderizações SEM disparar nova renderização da tela
  const prevTab = useRef('pix');   // Guarda qual era a aba anterior para detectar saída do carrinho
  const abandonId = useRef(null);  // Guarda o ID do push de carrinho abandonado (para poder cancelar)
  const cartRef = useRef(cart);    // Espelho do estado `cart` acessível dentro de efeitos sem re-dispará-los
  cartRef.current = cart;

  // Hook oficial do Expo que retorna a última notificação em que o usuário TOCOU
  const lastResponse = Notifications.useLastNotificationResponse();

  // Efeito 1: Executa uma única vez ao abrir o app para configurar permissões e canal
  useEffect(() => {
    setupNotifications().then(setPushOk);
  }, []);

  // Efeito 2: Monitora a troca de abas para a regra de "Carrinho Abandonado"
  useEffect(() => {
    const prev = prevTab.current;
    prevTab.current = tab;

    // Caso A: Usuário voltou ao carrinho ANTES do push ser disparado -> cancela o agendamento
    if (tab === 'cart' && abandonId.current) {
      Notifications.cancelScheduledNotificationAsync(abandonId.current);
      abandonId.current = null;
    }

    // Caso B: Usuário SAIU da aba 'cart' deixando itens lá dentro -> agenda o push com oferta
    if (prev === 'cart' && tab !== 'cart' && cartRef.current.length > 0) {
      const items = cartRef.current;
      const product = items[items.length - 1]; // Destaca o último produto adicionado na mensagem

      sendPush({
        title: 'Esqueceu algo no carrinho? 🛒',
        body: `${product.name} (${brl(product.price)}) está te esperando. Volte agora e pague só ${brl(
          product.price * (1 - CART_DISCOUNT)
        )} (10% OFF)!`,
        // Envia metadados para sabermos qual tela abrir e em qual produto aplicar o desconto
        data: { type: 'abandoned_cart', productId: product.id },
        seconds: ABANDON_DELAY_S,
      }).then((id) => {
        // Salva o ID retornado caso precisemos cancelar essa notificação
        abandonId.current = id;
      });
    }
  }, [tab]);

  // Efeito 3: Reage ao toque do usuário em qualquer notificação (Deep Linking interno)
  useEffect(() => {
    if (!lastResponse) return;

    // Lê o objeto `data` que anexamos no momento do `sendPush`
    const data = lastResponse.notification.request.content.data;

    if (data?.type === 'abandoned_cart') {
      setDiscountId(data.productId); // Ativa o desconto de 10% para o produto específico
      setTab('cart');                // Navega direto para o carrinho
    } else if (data?.type === 'pix') {
      setTab('pix');                 // Navega para a aba Pix
    } else if (data?.type === 'order') {
      setTab('orders');              // Navega para a aba Pedidos
    }
  }, [lastResponse]);

  /**
   * Cria um novo pedido na aba Lanchonete, agenda o push de aviso
   * e sincroniza a mudança de status na tela usando `setTimeout`.
   */
  const placeOrder = (item) => {
    const id = String(Date.now()); // Gera um ID único baseado no timestamp atual

    // Insere o pedido no topo da lista com status inicial "Aguardando"
    setOrders((o) => [{ id, name: item.name, emoji: item.emoji, status: 'Aguardando' }, ...o]);

    // Agenda a notificação push para daqui a ORDER_DELAY_S (10s)
    sendPush({
      title: 'Lanchonete Demo 🍽️',
      body: `Pedido "${item.name}" sendo feito`,
      data: { type: 'order', orderId: id },
      seconds: ORDER_DELAY_S,
    });

    // Atualiza o texto do status na tela no mesmo instante em que o push chega
    setTimeout(() => {
      setOrders((o) => o.map((x) => (x.id === id ? { ...x, status: 'Em preparo 👨‍🍳' } : x)));
    }, ORDER_DELAY_S * 1000);
  };

  // Soma total de unidades no carrinho para exibir no badge vermelho da barra inferior
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  return (
    <View style={s.root}>
      {/* Barra de status do sistema com ícones claros sobre fundo roxo */}
      <StatusBar barStyle="light-content" backgroundColor="#6C2BD9" />

      {/* Cabeçalho fixo do app */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Painel de Push</Text>
        <Text style={s.headerSub}>Protótipo de notificações</Text>
      </View>

      {/* Banner de aviso exibido apenas se o usuário negar permissão de notificação */}
      {pushOk && (
        <View style={s.warn}>
          <Text style={s.warnText}>
            Permissão de notificação negada. Ative nas configurações do aparelho para ver os pushes.
          </Text>
        </View>
      )}

      {/* Área de conteúdo dinâmico: renderiza apenas a tela da aba selecionada */}
      <View style={s.content}>
        {tab === 'pix' && <PixScreen />}
        {tab === 'cart' && (
          <CartScreen
            cart={cart}
            setCart={setCart}
            discountId={discountId}
            onCheckout={() => setDiscountId(null)} // Limpa o desconto após finalizar a compra
          />
        )}
        {tab === 'orders' && <OrdersScreen orders={orders} onOrder={placeOrder} />}
      </View>

      {/* Barra de navegação inferior (Tab Bar) */}
      <View style={s.tabBar}>
        <TabButton label="Pix" icon="💸" active={tab === 'pix'} onPress={() => setTab('pix')} />
        <TabButton
          label="Carrinho"
          icon="🛒"
          badge={cartCount}
          active={tab === 'cart'}
          onPress={() => setTab('cart')}
        />
        <TabButton label="Pedido" icon="🍔" active={tab === 'orders'} onPress={() => setTab('orders')} />
      </View>
    </View>
  );
}

/**
 * Botão reutilizável da barra inferior, com suporte opcional a badge numérico.
 */
function TabButton({ label, icon, active, onPress, badge }) {
  return (
    <TouchableOpacity style={s.tabBtn} onPress={onPress} activeOpacity={0.7}>
      <View>
        <Text style={[s.tabIcon, !active && { opacity: 0.45 }]}>{icon}</Text>
        {/* Exibe a bolinha vermelha com a quantidade apenas se badge > 0 */}
        {badge > 0 && (
          <View style={s.badge}>
            <Text style={s.badgeText}>{badge}</Text>
          </View>
        )}
      </View>
      <Text style={[s.tabLabel, active && s.tabLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// 4. ABA 1: PIX (Notificação Transacional Imediata/Curta)
// ---------------------------------------------------------------------------
function PixScreen() {
  const [valor, setValor] = useState('');
  const [chave, setChave] = useState('');
  const [senha, setSenha] = useState('');
  const [msg, setMsg] = useState(null); // Feedback visual de erro ou sucesso na tela

  const enviar = async () => {
    // Remove espaços e converte vírgula decimal (padrão BR) em ponto (padrão JS)
    const v = parseFloat(valor.replace(/\s/g, '').replace(',', '.'));

    // Validações dos campos do formulário
    if (!v || v <= 0) return setMsg({ ok: false, text: 'Informe um valor válido.' });
    if (!chave.trim()) return setMsg({ ok: false, text: 'Informe a chave Pix.' });
    if (senha !== PIX_PASSWORD) return setMsg({ ok: false, text: 'Senha incorreta.' });

    // Dispara o push de confirmação com 1 segundo de atraso
    await sendPush({
      title: 'Pix enviado ✅',
      body: `Você enviou ${brl(v)} para a chave ${chave.trim()}.`,
      data: { type: 'pix' },
      seconds: 1,
    });

    // Atualiza feedback na tela e limpa o formulário
    setMsg({ ok: true, text: `Pix de ${brl(v)} enviado para ${chave.trim()}.` });
    setValor('');
    setChave('');
    setSenha('');
  };

  return (
    <ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">
      <Text style={s.h1}>Enviar Pix</Text>

      <Text style={s.label}>Valor (R$)</Text>
      <TextInput
        style={s.input}
        placeholder="0,00"
        keyboardType="decimal-pad"
        value={valor}
        onChangeText={setValor}
      />

      <Text style={s.label}>Chave Pix</Text>
      <TextInput
        style={s.input}
        placeholder="CPF, e-mail, telefone ou chave aleatória"
        autoCapitalize="none"
        value={chave}
        onChangeText={setChave}
      />

      <Text style={s.label}>Senha</Text>
      <TextInput
        style={s.input}
        placeholder="Senha de 6 dígitos"
        secureTextEntry // Oculta os dígitos digitados
        keyboardType="number-pad"
        maxLength={6}
        value={senha}
        onChangeText={setSenha}
      />

      <TouchableOpacity style={s.primaryBtn} onPress={enviar}>
        <Text style={s.primaryBtnText}>Enviar Pix</Text>
      </TouchableOpacity>

      {/* Caixa de feedback condicional (verde para sucesso, vermelha para erro) */}
      {msg && (
        <View style={[s.msg, msg.ok ? s.msgOk : s.msgErr]}>
          <Text style={{ color: msg.ok ? '#0F6B3A' : '#A12020' }}>{msg.text}</Text>
        </View>
      )}
      <Text style={s.hint}>Dica: a senha de teste é 123456.</Text>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// 5. ABA 2: CARRINHO (Push de Carrinho Abandonado + Desconto Dinâmico)
// ---------------------------------------------------------------------------
function CartScreen({ cart, setCart, discountId, onCheckout }) {
  // Adiciona produto ao carrinho (ou incrementa a quantidade) e o move para o fim da lista
  // para que ele seja considerado o "último adicionado" no push de abandono
  const add = (p) =>
    setCart((c) => {
      const existing = c.find((i) => i.id === p.id);
      const rest = c.filter((i) => i.id !== p.id);
      return [...rest, { ...p, qty: existing ? existing.qty + 1 : 1 }];
    });

  // Incrementa (+1) ou decrementa (-1) a quantidade; remove o item se chegar a 0
  const changeQty = (id, delta) =>
    setCart((c) =>
      c.map((i) => (i.id === id ? { ...i, qty: i.qty + delta } : i)).filter((i) => i.qty > 0)
    );

  // Calcula o subtotal de um item, aplicando 10% OFF se o ID coincidir com `discountId`
  const lineTotal = (i) => {
    const base = i.price * i.qty;
    return i.id === discountId ? base * (1 - CART_DISCOUNT) : base;
  };

  const total = cart.reduce((sum, i) => sum + lineTotal(i), 0);
  const hasDiscount = cart.some((i) => i.id === discountId);

  // Finaliza a compra exibindo um alerta nativo, esvaziando o carrinho e resetando o desconto
  const checkout = () => {
    Alert.alert('Compra realizada 🎉', `Total pago: ${brl(total)}`);
    setCart([]);
    onCheckout();
  };

  return (
    <ScrollView contentContainerStyle={s.screen}>
      <Text style={s.h1}>Produtos</Text>
      {PRODUCTS.map((p) => (
        <View key={p.id} style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>{p.name}</Text>
            <Text style={s.rowSub}>{brl(p.price)}</Text>
          </View>
          <TouchableOpacity style={s.smallBtn} onPress={() => add(p)}>
            <Text style={s.smallBtnText}>Adicionar</Text>
          </TouchableOpacity>
        </View>
      ))}

      <Text style={[s.h1, { marginTop: 24 }]}>Seu carrinho</Text>

      {/* Banner verde exibido quando o usuário retorna pelo push de carrinho abandonado */}
      {hasDiscount && (
        <View style={[s.msg, s.msgOk]}>
          <Text style={{ color: '#0F6B3A' }}>🎁 Desconto de 10% aplicado pelo push!</Text>
        </View>
      )}

      {cart.length === 0 ? (
        <Text style={s.hint}>Carrinho vazio. Adicione um produto e troque de aba para ver o push.</Text>
      ) : (
        <>
          {cart.map((i) => (
            <View key={i.id} style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>{i.name}</Text>
                <Text style={s.rowSub}>
                  {i.qty} x {brl(i.price)}
                  {i.id === discountId ? '  (-10%)' : ''}
                </Text>
              </View>
              <Text style={s.price}>{brl(lineTotal(i))}</Text>
              <TouchableOpacity style={s.qtyBtn} onPress={() => changeQty(i.id, -1)}>
                <Text style={s.qtyText}>−</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.qtyBtn} onPress={() => changeQty(i.id, 1)}>
                <Text style={s.qtyText}>+</Text>
              </TouchableOpacity>
            </View>
          ))}
          <Text style={s.total}>Total: {brl(total)}</Text>
          <TouchableOpacity style={s.primaryBtn} onPress={checkout}>
            <Text style={s.primaryBtnText}>Finalizar compra</Text>
          </TouchableOpacity>
          <Text style={s.hint}>
            Saia desta aba sem finalizar e, em {ABANDON_DELAY_S}s, você recebe o push de carrinho abandonado.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// 6. ABA 3: PEDIDOS (Push de Atualização de Status / Delivery)
// ---------------------------------------------------------------------------
function OrdersScreen({ orders, onOrder }) {
  return (
    <ScrollView contentContainerStyle={s.screen}>
      <Text style={s.h1}>Cardápio</Text>
      {MENU.map((m) => (
        <View key={m.id} style={s.row}>
          <Text style={{ fontSize: 28, marginRight: 12 }}>{m.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>{m.name}</Text>
            <Text style={s.rowSub}>{brl(m.price)}</Text>
          </View>
          <TouchableOpacity style={s.smallBtn} onPress={() => onOrder(m)}>
            <Text style={s.smallBtnText}>Pedir</Text>
          </TouchableOpacity>
        </View>
      ))}

      <Text style={[s.h1, { marginTop: 24 }]}>Meus pedidos</Text>
      {orders.length === 0 ? (
        <Text style={s.hint}>Faça um pedido. Em {ORDER_DELAY_S}s chega o push de "pedido sendo feito".</Text>
      ) : (
        orders.map((o) => (
          <View key={o.id} style={s.row}>
            <Text style={{ fontSize: 24, marginRight: 12 }}>{o.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>{o.name}</Text>
              <Text style={s.rowSub}>{o.status}</Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// 7. ESTILIZAÇÃO (StyleSheet do React Native)
// ---------------------------------------------------------------------------
const PRIMARY = '#6C2BD9'; // Cor principal da identidade visual do protótipo

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F6FA' },
  header: {
    backgroundColor: PRIMARY,
    // Ajusta o espaçamento superior conforme a altura da barra de status no iOS ou Android
    paddingTop: Platform.OS === 'ios' ? 56 : (StatusBar.currentHeight || 24) + 8,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  headerSub: { color: '#E3D5FA', marginTop: 2 },
  warn: { backgroundColor: '#FFF3CD', padding: 10 },
  warnText: { color: '#7A5B00', fontSize: 13 },
  content: { flex: 1 },
  screen: { padding: 20, paddingBottom: 40 },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingBottom: Platform.OS === 'ios' ? 20 : 6,
    paddingTop: 8,
  },
  tabBtn: { flex: 1, alignItems: 'center' },
  tabIcon: { fontSize: 24 },
  tabLabel: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  tabLabelActive: { color: PRIMARY, fontWeight: '700' },
  badge: {
    position: 'absolute',
    top: -4,
    right: -12,
    backgroundColor: '#E11D48',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  h1: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 12 },
  label: { fontSize: 13, color: '#4B5563', marginTop: 12, marginBottom: 4 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  primaryBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  msg: { padding: 12, borderRadius: 10, marginTop: 16 },
  msgOk: { backgroundColor: '#D9F5E5' },
  msgErr: { backgroundColor: '#FADADA' },
  hint: { color: '#6B7280', fontSize: 13, marginTop: 14 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  rowTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  rowSub: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  price: { fontWeight: '700', marginHorizontal: 8, color: '#111827' },
  smallBtn: { backgroundColor: PRIMARY, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  smallBtnText: { color: '#fff', fontWeight: '600' },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#EDE7FB',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  qtyText: { color: PRIMARY, fontSize: 18, fontWeight: '700' },
  total: { fontSize: 18, fontWeight: '700', textAlign: 'right', marginTop: 8, color: '#111827' },
});