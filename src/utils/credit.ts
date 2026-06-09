import { SupabaseClient } from "@supabase/supabase-js";

/**
 * 고객의 크레딧(unallocated_amount)을 지정한 금액만큼 차감합니다.
 * 오래된 크레딧부터 순차적으로 차감됩니다.
 */
export const deductCustomerCredit = async (
  supabase: SupabaseClient,
  customerId: string,
  amountToDeduct: number
) => {
  if (amountToDeduct <= 0) return;

  // 1. 잔여 크레딧이 있는 항목을 오래된 순으로 가져옵니다.
  const { data: credits, error } = await supabase
    .from("payments")
    .select("id, unallocated_amount")
    .eq("customer_id", customerId)
    .gt("unallocated_amount", 0)
    .order("payment_date", { ascending: true });

  if (error) throw error;
  if (!credits || credits.length === 0) throw new Error("No available credit found.");

  let remaining = amountToDeduct;
  const updatePromises = [];

  // 2. 차감 금액이 0이 될 때까지 순회하며 잔액을 깎습니다.
  for (const credit of credits) {
    if (remaining <= 0) break;

    const deduct = Math.min(credit.unallocated_amount, remaining);
    const newUnallocated = credit.unallocated_amount - deduct;

    updatePromises.push(
      supabase
        .from("payments")
        .update({ unallocated_amount: newUnallocated })
        .eq("id", credit.id)
    );

    remaining -= deduct;
  }

  // 3. 만약 DB의 실제 잔액보다 더 많은 금액을 차감하려고 했다면 에러 방어
  if (remaining > 0.01) {
    throw new Error("Not enough credit available to deduct.");
  }

  // 4. 병렬로 모든 업데이트 실행
  await Promise.all(updatePromises);
};

/**
 * [CASE 1] 크레딧 메모(CR-) 또는 일반 결제(PAY-) 자체가 삭제될 때:
 * 이 결제 수단으로 결제했던 다른 인보이스들의 paid_amount를 차감하고 상태를 되돌립니다.
 */
export const revertAllocationsFromPaymentSource = async (
  supabase: SupabaseClient,
  paymentIds: string[]
) => {
  if (!paymentIds || paymentIds.length === 0) return;

  const { data: allocations } = await supabase.from("payment_allocations").select("invoice_id, amount").in("payment_id", paymentIds);
  
  if (allocations && allocations.length > 0) {
      // 영향을 받는 인보이스 ID 추출
      const invoiceIdsToUpdate = Array.from(new Set(allocations.map(a => a.invoice_id)));
      const { data: targetInvs } = await supabase.from("invoices").select("id, total_amount, paid_amount").in("id", invoiceIdsToUpdate);

      if (targetInvs && targetInvs.length > 0) {
          const updates = targetInvs.map(targetInv => {
              // 이 인보이스에 들어갔던 삭제 대상 결제/크레딧 금액 합산
              const allocsForThisInv = allocations.filter(a => a.invoice_id === targetInv.id);
              const totalAllocAmount = allocsForThisInv.reduce((sum, a) => sum + a.amount, 0);
              
              // paid_amount 롤백 및 상태 재계산
              const newPaid = Math.max(0, (targetInv.paid_amount || 0) - totalAllocAmount);
              let newStatus = "Unpaid";
              if (newPaid >= targetInv.total_amount && targetInv.total_amount > 0) newStatus = "Paid";
              else if (newPaid > 0) newStatus = "Partial";

              return supabase.from("invoices").update({ paid_amount: newPaid, status: newStatus }).eq("id", targetInv.id);
          });
          await Promise.all(updates);
      }
      // 할당 내역 삭제
      await supabase.from("payment_allocations").delete().in("payment_id", paymentIds);
  }
  
  // payments 테이블에서 해당 결제/크레딧 내역 자체를 삭제합니다.
  await supabase.from("payments").delete().in("id", paymentIds);
};

/**
 * [CASE 2] 일반 인보이스가 삭제될 때:
 * 이 인보이스를 결제하는 데 사용됐던 크레딧/결제 금액을 원래 payment의 잔액(unallocated_amount)으로 환불해줍니다.
 */
export const refundAllocationsToPaymentSource = async (
  supabase: SupabaseClient,
  invoiceIds: string[]
) => {
  if (!invoiceIds || invoiceIds.length === 0) return;

  const { data: allocations } = await supabase.from("payment_allocations").select("payment_id, amount").in("invoice_id", invoiceIds);
  
  if (allocations && allocations.length > 0) {
      // 결제 원단위(payment_id)별로 환불할 금액을 모두 합산
      const refundMap = allocations.reduce((acc, curr) => {
          acc[curr.payment_id] = (acc[curr.payment_id] || 0) + curr.amount;
          return acc;
      }, {} as Record<string, number>);

      // 합산된 금액을 순회하며 잔액(unallocated_amount) 복구
      const updatePromises = Object.entries(refundMap).map(async ([paymentId, refundAmount]) => {
          const { data: payData } = await supabase.from("payments").select("unallocated_amount").eq("id", paymentId).single();
          if (payData) {
              return supabase.from("payments")
                  .update({ unallocated_amount: payData.unallocated_amount + refundAmount })
                  .eq("id", paymentId);
          }
      });
      
      await Promise.all(updatePromises);
      
      // 환불 처리가 끝난 할당 내역 일괄 삭제
      await supabase.from("payment_allocations").delete().in("invoice_id", invoiceIds);
  }
};