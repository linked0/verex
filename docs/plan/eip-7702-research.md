# EIP-7702 Research Note — EOA의 임시 스마트 계정 실행

> **출처**: 사용자(jay) 정리, 2026-05-08.
> **연결**: [README §11.4](./README.md) (트래킹), [README §2.2.8](./README.md) (Account Abstraction).
> **상태**: Phase 3 W7 진입 전 결정 사항. 본 문서는 reference이고 결정/액션은 §11.4에서 추적.

---

## 한 줄 요약

EIP-7702는 EOA(Externally Owned Account)가 특정 트랜잭션 실행 시 지정된 컨트랙트의 코드를 임시로 실행할 수 있게 함으로써, 별도의 스마트 계정 배포 없이도 계정 추상화의 핵심 기능들(배치 실행, 가스 스폰서십, 소셜 복구)을 EOA에서 직접 사용 가능하게 한다.

## 왜 EIP-7702인가 — ERC-4337의 한계와 해결책

ERC-4337은 UserOperation → Bundler → EntryPoint 컨트랙트 경유로 스마트 계정을 구현했다. 강력하지만 복잡하다. 기존 EOA를 4337 기반 스마트 계정으로 마이그레이션하는 것은 여전히 마찰이 있고, 수억 달러 자산이 여전히 EOA에 있다는 현실이 장벽이었다. EIP-7702는 이 문제를 정면 돌파한다. **기존 EOA를 그대로 유지하면서**, 특정 트랜잭션에서만 지정된 컨트랙트 코드를 빌려 실행하는 방식이다.

## 핵심 메커니즘

```
// EIP-7702가 도입한 새 트랜잭션 타입: Type 4 (0x04)
// 트랜잭션에 authorization_list 필드 추가:

authorization_list: [
  {
    chain_id: 8453,                    // 대상 체인 ID (Base 등 EIP-7702 지원 체인)
    address: 0xDelegateContract,       // 빌릴 코드의 컨트랙트 주소
    nonce: 42,
    v, r, s,                           // EOA가 서명
  }
]

// 이 트랜잭션이 실행되면:
// 1. EOA의 코드 슬롯에 0xef0100 || address 형태로 설정됨
// 2. 해당 트랜잭션에서 EOA는 DelegateContract의 코드를 실행
// 3. 트랜잭션이 끝나도 delegation 설정은 유지됨
//    (revoke 트랜잭션으로 해제 가능)
```

## 실전 사용 패턴: Verex 예측시장에서의 적용

```typescript
import { createWalletClient, encodeFunctionData } from 'viem'
import { eip7702Actions } from 'viem/experimental'

const client = createWalletClient({...}).extend(eip7702Actions())

// 패턴 1: 배치 트랜잭션 (approve + createPosition 1회 서명)
// 기존: 2번 팝업 (approve, createPosition 각각)
// EIP-7702 이후: 1번 서명으로 완료

const batchDelegateContract = '0xBatchExecutor...'

const auth = await client.signAuthorization({
  contractAddress: batchDelegateContract,
})

await client.sendTransaction({
  authorizationList: [auth],
  to: client.account.address,  // 자기 자신에게
  data: encodeFunctionData({
    abi: batchDelegateAbi,
    functionName: 'execute',
    args: [[
      // Step 1: USDC approve
      {
        target: USDC_ADDRESS,
        callData: encodeApprove(MARKET_ADDRESS, parseEther('100'))
      },
      // Step 2: 예측시장 포지션 생성
      {
        target: MARKET_ADDRESS,
        callData: encodeCreatePosition(marketId, 'YES', parseEther('100'))
      },
    ]]
  })
})

// 패턴 2: 가스 스폰서십 (신규 사용자 온보딩에 핵심)
// Paymaster가 대신 가스 지불 → 사용자는 ETH 없이 첫 베팅 가능
// Verex의 신규 사용자 획득 전략에 직접 활용 가능

// 패턴 3: 소셜 복구
// RecoveryDelegate 설정 → 가디언이 분실 키 복구
```

## 보안 주의사항

```solidity
// ⚠️ DelegateContract 선택 시 핵심 주의사항:
// 악의적 컨트랙트를 authorization에 포함하면
// 그 컨트랙트가 EOA의 전체 자산에 접근 가능
//
// 안전 조건:
// 1. 오딧된 신뢰할 수 있는 컨트랙트만 사용
// 2. Revoke 패턴 항상 구현 (delegation 해제)
// 3. 체인 ID 명시 필수 (크로스체인 replaying 방지)

// Revoke: 빈 주소로 재설정
const revokeAuth = await client.signAuthorization({
  contractAddress: '0x0000000000000000000000000000000000000000',
})
```

## Verex에의 직접 함의

EIP-7702는 Pectra 업그레이드(2025) 이후 Ethereum 메인넷과 다수 L2에서 사용 가능. Verex가 어느 체인에 배포되든, EIP-7702가 그 체인에서 활성화되어 있다면 다음을 얻는다: 신규 사용자 온보딩 마찰이 극적으로 줄어들고(가스 스폰서십), 베팅 UX가 2번 서명에서 1번으로 단순화되며, AA 인프라가 별도 스마트 계정 배포 없이 EOA에서 직접 동작.

대상 체인의 EIP-7702 활성화 여부는 §11.4 B1에서 검증.
