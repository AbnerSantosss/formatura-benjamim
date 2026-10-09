import { formatNumber } from '@/domain/orders';
import type { OrderMode } from '@/domain/types';

// Resumo do produto e dos números do pedido. Os dados vêm do servidor (visão pública do pedido).
export type OrderDetailsData = {
  mode: OrderMode;
  numbers: number[];
  product: { title: string };
};

const modeLabels: Record<OrderMode, string> = {
  NUMBERS: 'Números das cestas',
  EXTRA: 'Colaboração avulsa',
};

export default function OrderDetails({ order }: { order: OrderDetailsData }) {
  return (
    <div className="order-product-detail">
      <b>{order.product.title}</b>
      <span>
        {modeLabels[order.mode]}
        {order.mode === 'NUMBERS' ? ` · ${order.numbers.length} números` : ' · sem números'}
      </span>
      {!!order.numbers.length && (
        <details>
          <summary>Ver números do pedido</summary>
          <p>{order.numbers.map(formatNumber).join(' · ')}</p>
        </details>
      )}
    </div>
  );
}
