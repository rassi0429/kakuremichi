/**
 * スクリプト: データベース内のAgent/GatewayにWireGuard鍵とvirtualIPを設定
 */
import { db, agents, gateways } from '../lib/db';
import { eq } from 'drizzle-orm';
import { generateWireguardKeyPair } from '../lib/wireguard/keygen';

async function updateDatabaseKeys() {
  console.log('🔧 データベース更新開始...\n');

  // 全Agentを取得
  const allAgents = await db.select().from(agents);
  console.log(`📋 Agent数: ${allAgents.length}`);

  for (const agent of allAgents) {
    console.log(`\n🔑 Agent更新中: ${agent.name} (${agent.id})`);

    // WireGuard鍵ペア生成
    const { privateKey, publicKey } = generateWireguardKeyPair();

    // virtualIP生成（subnet の .100）
    // subnet例: "10.1.0.0/24" -> virtualIP: "10.1.0.100"
    const subnetMatch = agent.subnet?.match(/^(\d+\.\d+\.\d+)\.\d+\/\d+$/);
    const virtualIP = subnetMatch ? `${subnetMatch[1]}.100` : null;

    if (!virtualIP) {
      console.warn(`  ⚠️  subnetが不正: ${agent.subnet}`);
      continue;
    }

    // DB更新
    await db
      .update(agents)
      .set({
        wireguardPrivateKey: privateKey,
        wireguardPublicKey: publicKey,
        virtualIP: virtualIP,
      })
      .where(eq(agents.id, agent.id));

    console.log(`  ✅ 更新完了`);
    console.log(`     - virtualIP: ${virtualIP}`);
    console.log(`     - publicKey: ${publicKey.substring(0, 20)}...`);
  }

  // 全Gatewayを取得
  const allGateways = await db.select().from(gateways);
  console.log(`\n📋 Gateway数: ${allGateways.length}`);

  for (const gateway of allGateways) {
    console.log(`\n🔑 Gateway更新中: ${gateway.name} (${gateway.id})`);

    // WireGuard鍵ペア生成
    const { privateKey, publicKey } = generateWireguardKeyPair();

    // publicIP設定（テスト用にlocalhost、本番では実際のIP）
    const publicIP = gateway.publicIP || '127.0.0.1';

    // DB更新
    await db
      .update(gateways)
      .set({
        wireguardPrivateKey: privateKey,
        wireguardPublicKey: publicKey,
        publicIP: publicIP,
      })
      .where(eq(gateways.id, gateway.id));

    console.log(`  ✅ 更新完了`);
    console.log(`     - publicIP: ${publicIP}`);
    console.log(`     - publicKey: ${publicKey.substring(0, 20)}...`);
  }

  console.log('\n✨ データベース更新完了！\n');
}

// 実行
updateDatabaseKeys()
  .then(() => {
    console.log('✅ スクリプト正常終了');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ エラー:', error);
    process.exit(1);
  });
