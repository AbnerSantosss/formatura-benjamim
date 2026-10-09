import { DemoPayment, formatNumber, modeLabels, paymentProduct } from '@/lib/demo-model';
export default function OrderDetails({ payment }: { payment: DemoPayment }) {
  return (
    <div className="order-product-detail">
      <b>{paymentProduct(payment).title}</b>
      <span>
        {modeLabels[payment.mode || 'extra']}
        {payment.mode === 'numbers' ? ` · ${payment.numbers?.length || 0} números` : ' · sem números'}
      </span>
      {!!payment.numbers?.length && (
        <details>
          <summary>Ver números do pedido</summary>
          <p>{payment.numbers.map(formatNumber).join(' · ')}</p>
        </details>
      )}
    </div>
  );
}
