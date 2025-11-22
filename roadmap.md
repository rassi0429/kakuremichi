# kakuremichi - ロードマップ（Phase 2以降）

このドキュメントは、MVP（Phase 1）完成後の将来的な機能拡張計画を記載しています。
MVP（Phase 1）の要件については、`requirements.md`を参照してください。

---

## Phase 2: 本番運用対応

**目標**: エンタープライズ利用に耐えるシステム

### 含める機能

#### Kubernetes統合
- [ ] Helmチャートの提供
- [ ] K8s Service自動検出（K8s API連携）
- [ ] アノテーション/ラベルベースの自動公開
- [ ] 複数Namespaceサポート
- [ ] IngressController不要の構成

**ユースケース: Kubernetesクラスタでのサービス公開**

**アクター**: K8sユーザー

**前提条件**:
- Kubernetesクラスタで複数のサービスが稼働
- IngressやLoadBalancerを使わずに外部公開したい
- クラスタはプライベートネットワーク（GKE、EKS、オンプレなど）

**ストーリー**:
1. HelmでAgentをインストール:
   ```bash
   helm repo add kakuremichi https://charts.kakuremichi.io
   helm install agent kakuremichi/agent \
     --set control.url=https://control.example.com \
     --set control.apiKey=xxx
   ```
2. Agentが自動的にK8sクラスタ内のServiceを検出
3. Controlの管理画面で公開するServiceを選択:
   - Service: `my-app-service` (Namespace: default)
   - ドメイン: `app.example.com`
4. 保存

**期待される動作**:
- AgentがK8s APIを使ってService情報を取得
- 自動的にトンネルを確立
- `https://app.example.com`で外部からアクセス可能
- Serviceの変更を自動検出（ポート変更、削除など）
- IngressやLoadBalancerのセットアップ不要

**オプション機能**:
- アノテーション/ラベルベースの自動公開:
  ```yaml
  apiVersion: v1
  kind: Service
  metadata:
    name: my-app
    annotations:
      kakuremichi.io/enabled: "true"
      kakuremichi.io/domain: "app.example.com"
  ```
- 複数Namespaceサポート
- HelmチャートでのControl + Gateway + Agentのまとめてデプロイ

**メリット**:
- IngressController不要
- LoadBalancer（外部IP）不要
- ノードポート開放不要
- 既存のK8s Serviceをそのまま使える

#### 組織・権限管理
- [ ] 複数組織サポート
- [ ] RBAC（ロールベースアクセス制御）
- [ ] 組織ごとのリソース分離
- [ ] チーム管理機能

#### 監視・運用
- [ ] 監査ログ
- [ ] メトリクス収集・可視化（帯域幅、接続数など）
- [ ] アラート・通知機能
- [ ] ダッシュボードの強化

#### 開発者体験の向上
- [ ] CLI管理ツール（kokoactl）
- [ ] 一時トンネル機能（ngrokライク）
- [ ] バイナリ配布（各OS対応: Windows, macOS, Linux）

#### プロキシ機能拡張
- [ ] Dockerコンテナ自動検出（ラベルベース）
- [ ] DNS API統合（自動DNS設定）
- [ ] WebSocketプロキシ対応
- [ ] gRPCプロキシ対応
- [ ] ワイルドカード証明書対応

### 成果物
- ユースケース3, 4, 7が実現できる
- 本番環境での運用が可能
- K8sクラスタでの利用が可能

---

## Phase 3: エンタープライズ機能

**目標**: 大規模組織での利用に対応

### 含める機能

#### 高度な認証
- [ ] OAuth/OIDC統合
- [ ] SAML対応
- [ ] WebAuthn/パスキー対応
- [ ] 多要素認証（MFA）
- [ ] SSO（シングルサインオン）

#### SSL/証明書管理
- [ ] カスタムSSL証明書アップロード
- [ ] 証明書のインポート・エクスポート
- [ ] ワイルドカード証明書の高度な管理
- [ ] 証明書の一括管理

#### レポート・分析
- [ ] 高度なレポート機能
- [ ] 使用量レポート
- [ ] アクセスログの詳細分析
- [ ] グラフ・チャート表示
- [ ] カスタムダッシュボード

#### スケーラビリティ
- [ ] 水平スケーリングの最適化
- [ ] キャッシュ層の追加（Redis）
- [ ] データベースのレプリケーション
- [ ] 高可用性構成のテンプレート

#### コンプライアンス
- [ ] コンプライアンスレポート
- [ ] データ保持ポリシー
- [ ] GDPR対応
- [ ] SOC2対応

### 成果物
- エンタープライズグレードのシステム
- 大規模組織での導入実績

---

## 検討中のアイデア（Phase 4以降）

### より高度な機能
- [ ] API Gateway機能（レート制限、認証、変換）
- [ ] サービスメッシュ統合
- [ ] マルチクラウド対応
- [ ] エッジコンピューティング統合
- [ ] P2Pトンネル（Gatewayを経由しない直接接続）

### 開発者向け機能
- [ ] プラグインシステム
- [ ] Webhook統合
- [ ] カスタムミドルウェアのサポート
- [ ] SDKの提供（Go, Python, Node.js）

### 管理・運用
- [ ] GitOps対応（Infrastructure as Code）
- [ ] Terraform Provider
- [ ] Ansible Module
- [ ] 自動バックアップ・リストア

---

**作成日**: 2025-11-22
**最終更新**: 2025-11-22
