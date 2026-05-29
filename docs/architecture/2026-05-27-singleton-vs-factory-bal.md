# Singleton settlement vs Factory pattern — BAL 친화 비교

> 2026-05-27 작성. Glamsterdam의 BAL(Block-level Access Lists, EIP-7928 후보)
> 도입을 가정했을 때 Verex 백본을 어떤 구조로 둘지의 비교 분석. 결정은
> Glamsterdam EIP scope 확정 + Phase 2 백본 fork/replace 검토 시점으로
> 보류 — 분석은 미리 박아둠.

## 1. 싱글톤(monolithic) settlement — Polymarket 류

```solidity
contract VerexSettlement {
    // 모든 마켓이 같은 매핑에 들어감
    mapping(bytes32 marketId => Market) public markets;
    mapping(bytes32 marketId => mapping(address => uint256)) public bets;

    function placeBet(bytes32 marketId, ...) external { /*...*/ }
    function resolve(bytes32 marketId, ...) external { /*...*/ }
}
```

**문제**: BAL이 storage slot 단위로 충돌 판단할 때, 같은 매핑의 다른 key도 internally는 hash로 slot이 흩어지지만 — EVM 표준은 "같은 슬롯의 충돌 여부"만 본다. 매핑은 그 자체로 base slot 1개 + 동적 슬롯들. 결과적으로:

- 마켓 A의 베팅과 마켓 B의 베팅 — storage slot 다름 → 충돌 없음 (병렬 가능)
- 하지만 같은 마켓 A의 베팅 두 개 — 같은 동적 슬롯 → 충돌 (sequential)

## 2. Factory 패턴 — 마켓별 독립 컨트랙트 (Verex가 검토 중인 방향)

```solidity
contract VerexMarketFactory {
    function createMarket(bytes32 spec) external returns (address market) {
        market = address(new VerexMarket(spec));  // 마켓당 독립 컨트랙트
        emit MarketCreated(market, spec);
    }
}

contract VerexMarket {
    address public immutable asset;     // 결제 자산
    mapping(address => uint256) public bets;  // 이 마켓 베팅만
    uint256 public totalYes;
    uint256 public totalNo;

    function placeBet(bool side, uint256 amount) external { /*...*/ }
}
```

**장점**:

- 마켓 A의 모든 베팅은 contract A의 storage에만 접근
- 마켓 B의 모든 베팅은 contract B의 storage에만 접근
- 서로 다른 마켓의 트랜잭션 → BAL에서 정의상 충돌 없음 → 병렬 실행 100% 보장

## 3. 결정 시 추가로 고려할 축

위 두 패턴 비교는 **BAL 친화도**만 본다. 실제 결정 시점에는 다음을 같이 평가해야 한다.

- **가스 비용**: 마켓 생성 시 Factory 패턴이 새 컨트랙트 배포 비용 부담. 싱글톤은 storage write 한 번이면 충분
- **컨트랙트 size 한계**: 싱글톤이 EIP-170 24KB 한계에 더 빨리 닿음. Factory의 per-market 컨트랙트는 작게 유지 가능
- **upgrade 표면**: 싱글톤 하나만 upgrade하면 모든 마켓 영향 / Factory는 새 마켓부터 새 implementation 적용 가능 (기존 마켓은 그대로)
- **클라이언트 단순성**: 싱글톤은 모든 호출이 한 주소 / Factory는 마켓 주소를 클라이언트가 추적해야 함
- **MEV / 매칭 모델**: 현재 CTFExchange는 싱글톤 매칭 venue — Factory로 가면 매칭 레이어와 정산 레이어의 위치 관계 재설계 필요
- **Polymarket fork 결정**: 우리가 자체 구현이면 Factory 자유 / Polymarket을 그대로 쓰면 싱글톤에 묶임

## 4. 트리거와 후속 작업

- **트리거**: Glamsterdam EIP scope 확정 (BAL 포함 시) 또는 Phase 2 백본의 fork/replace 검토 시점 — 둘 중 먼저 오는 것
- **결정 시 산출물**: `docs/history/<date>-bal-pattern-choice.md`에 결정 + 이유 기록
- **연결되는 watch-list 항목**: §1 (Glamsterdam BAL 친화 설계) 의 구체화. 본 분석은 §1이 발화될 때 직접 입력으로 사용
