import { SupabaseClient } from "@supabase/supabase-js";

// 두 컴포넌트(Order, Invoice)에서 넘어오는 데이터 형태가 조금씩 다를 수 있으므로
// 재고 업데이트에 딱 필요한 3가지 속성만 정의합니다.
export interface InventoryUpdateItem {
    productId: string;
    quantity: number;
    unit: string;
}

// 🚀 단위가 박스(CTN/Carton/Box)인지 정확히 판별하는 함수 (공용으로 빼기)
export const isCtnUnit = (unitStr: string | undefined | null) => {
    if (!unitStr) return false;
    const s = unitStr.toLowerCase();
    return s.includes('ctn') || s.includes('carton') || s.includes('box');
};

// 🚀 공용 재고 업데이트 함수
export const updateInventory = async (
    supabase: SupabaseClient<any, "public", any>, // DB 통신을 위해 supabase 객체를 인자로 받음
    itemList: InventoryUpdateItem[],
    isReturn: boolean // false면 재고 차감(판매), true면 재고 증가(반품/크레딧)
) => {
    const validItems = itemList.filter(i => i.productId);
    if (validItems.length === 0) return;

    const productIds = Array.from(new Set(validItems.map(i => i.productId)));

    const { data: products } = await supabase
        .from('products')
        .select('id, current_stock_level, current_stock_level_pack, total_pack_ctn')
        .in('id', productIds);

    if (!products) return;

    const updateQtyMap = new Map<string, { ctn: number, pack: number }>();
    
    validItems.forEach(item => {
        if (!updateQtyMap.has(item.productId)) {
            updateQtyMap.set(item.productId, { ctn: 0, pack: 0 });
        }
        const req = updateQtyMap.get(item.productId)!;
        const qty = Math.abs(Number(item.quantity) || 0);
        
        if (isCtnUnit(item.unit)) req.ctn += qty;
        else req.pack += qty;
    });

    const updatePromises = []; 

    for (const [productId, req] of updateQtyMap.entries()) {
        const product = products.find((p: any) => p.id === productId);
        if (!product) continue;

        const currentCtn = Number(product.current_stock_level) || 0;
        const currentPack = Number(product.current_stock_level_pack) || 0;
        const packsPerCtn = Number(product.total_pack_ctn) || 0; 
        
        const hasCarton = packsPerCtn > 1;

        let newCtn = currentCtn;
        let newPack = currentPack;

        if (hasCarton) {
            let totalCurrentPacks = (currentCtn * packsPerCtn) + currentPack;
            const totalUpdatePacks = (req.ctn * packsPerCtn) + req.pack;

            if (isReturn) {
                totalCurrentPacks += totalUpdatePacks; // 반품: 재고 증가
            } else {
                totalCurrentPacks -= totalUpdatePacks; // 판매: 재고 차감
            }

            newCtn = Math.floor(totalCurrentPacks / packsPerCtn);
            newPack = totalCurrentPacks % packsPerCtn;
            
            if (newPack < 0) {
                newPack += packsPerCtn;
            }
        } else {
            if (isReturn) {
                newCtn += req.ctn;
                newPack += req.pack;
            } else {
                newCtn -= req.ctn;
                newPack -= req.pack;
            }
        }

        updatePromises.push(
            supabase
                .from('products')
                .update({ 
                    current_stock_level: newCtn, 
                    current_stock_level_pack: newPack 
                })
                .eq('id', productId)
        );
    }

    await Promise.all(updatePromises);
};