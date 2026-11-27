'use server';

import { listMenu, listMenuCategories } from '@/app/actions/menu';
import { listDiscounts } from '@/app/actions/discounts';
import { listContacts } from '@/app/actions/contacts';
import { listKitchenOrders } from '@/app/actions/kitchen';

export async function getPosInitialData() {
    const [menu, discounts, categories, contacts, kitchenOrders] = await Promise.all([
        listMenu(),
        listDiscounts(),
        listMenuCategories(),
        listContacts(),
        listKitchenOrders(),
    ]);

    return { menu, discounts, categories, contacts, kitchenOrders };
}