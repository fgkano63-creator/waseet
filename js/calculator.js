/**
 * WASEET (وسيط) - Dynamic Fee Calculation Engine
 * Updated Fee Tiers:
 * - Price < 50: fee = 3
 * - 50 <= Price < 100: fee = 5
 * - 100 <= Price < 250: fee = 10
 * - 250 <= Price < 500: fee = 15
 * - 500 <= Price < 750: fee = 20
 * - 750 <= Price < 850: fee = 25
 * - 850 <= Price < 1000: fee = 30
 * - 1000 <= Price < 1500: fee = 35
 * - 1500 <= Price < 2000: fee = 40
 * - 2000 <= Price < 2500: fee = 45
 * - 2500 <= Price < 3000: fee = 45
 * - Price >= 3000: fee = 50 (إلى ما لا نهاية)
 */

function calculateWaseetFee(sellerPrice) {
    const price = parseFloat(sellerPrice) || 0;
    if (price <= 0) {
        return {
            sellerPrice: 0,
            fee: 0,
            buyerPrice: 0,
            tierText: 'غير محدد'
        };
    }

    let fee = 0;
    let tierText = '';

    if (price < 50) {
        fee = 3;
        tierText = 'أقل من 50$ (عمولة ثابتة 3$)';
    } else if (price < 100) {
        fee = 5;
        tierText = 'من 50$ إلى 99$ (عمولة ثابتة 5$)';
    } else if (price >= 100 && price < 250) {
        fee = 10;
        tierText = 'من 100$ إلى 250$ (عمولة 10$)';
    } else if (price >= 250 && price < 500) {
        fee = 15;
        tierText = 'من 250$ إلى 500$ (عمولة 15$)';
    } else if (price >= 500 && price < 750) {
        fee = 20;
        tierText = 'من 500$ إلى 750$ (عمولة 20$)';
    } else if (price >= 750 && price < 850) {
        fee = 25;
        tierText = 'من 750$ إلى 850$ (عمولة 25$)';
    } else if (price >= 850 && price < 1000) {
        fee = 30;
        tierText = 'من 850$ إلى 1000$ (عمولة 30$)';
    } else if (price >= 1000 && price < 1500) {
        fee = 35;
        tierText = 'من 1000$ إلى 1500$ (عمولة 35$)';
    } else if (price >= 1500 && price < 2000) {
        fee = 40;
        tierText = 'من 1500$ إلى 2000$ (عمولة 40$)';
    } else if (price >= 2000 && price < 2500) {
        fee = 45;
        tierText = 'من 2000$ إلى 2500$ (عمولة 45$)';
    } else if (price >= 2500 && price < 3000) {
        fee = 45;
        tierText = 'من 2500$ إلى 3000$ (عمولة 45$)';
    } else {
        fee = 50;
        tierText = 'من 3000$ فما فوق (عمولة ثابتة 50$)';
    }

    const buyerPrice = price + fee;

    return {
        sellerPrice: price,
        fee: fee,
        buyerPrice: buyerPrice,
        tierText: tierText
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { calculateWaseetFee };
}
