import { fetchWithAuth } from './apiClient';

declare global {
  interface Window {
    Razorpay?: any;
  }
}

export interface RazorpayCheckoutOptions {
  planId: string;
  userName?: string;
  userEmail?: string;
  onSuccess?: (data: any) => void;
  onError?: (err: string) => void;
}

export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export async function openRazorpayCheckout({
  planId,
  userName = 'Recruiter',
  userEmail = '',
  onSuccess,
  onError,
}: RazorpayCheckoutOptions) {
  try {
    const isScriptLoaded = await loadRazorpayScript();
    if (!isScriptLoaded && typeof window !== 'undefined' && !window.Razorpay) {
      onError?.('Failed to load Razorpay payment gateway SDK. Please check your internet connection.');
      return;
    }

    // 1. Create order on FastAPI backend
    const orderRes = await fetchWithAuth('/api/payments/order', {
      method: 'POST',
      body: JSON.stringify({ plan_id: planId }),
    });

    if (!orderRes.ok) {
      const err = await orderRes.json().catch(() => ({ detail: 'Failed to create order' }));
      onError?.(err.detail || 'Failed to initialize payment order.');
      return;
    }

    const orderData = await orderRes.json();
    const { order_id, amount, currency, key_id } = orderData;

    // 2. Configure Razorpay modal
    const rzpOptions = {
      key: key_id || 'rzp_test_mock_key',
      amount: amount,
      currency: currency || 'INR',
      name: 'RecruitAI',
      description: `Subscription Upgrade (${planId.toUpperCase()})`,
      image: '/icon.png',
      order_id: order_id,
      handler: async function (response: any) {
        try {
          const verifyRes = await fetchWithAuth('/api/payments/verify', {
            method: 'POST',
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id || order_id,
              razorpay_payment_id: response.razorpay_payment_id || `pay_${Date.now()}`,
              razorpay_signature: response.razorpay_signature || 'mock_valid_signature',
              plan_id: planId,
            }),
          });

          if (!verifyRes.ok) {
            const verifyErr = await verifyRes.json().catch(() => ({ detail: 'Verification failed' }));
            onError?.(verifyErr.detail || 'Payment verification failed.');
            return;
          }

          const verifiedData = await verifyRes.json();
          onSuccess?.(verifiedData);
        } catch (e: any) {
          onError?.(e.message || 'Payment verification network error.');
        }
      },
      prefill: {
        name: userName,
        email: userEmail,
      },
      theme: {
        color: '#1B2A4A',
      },
      modal: {
        ondismiss: function () {
          onError?.('Checkout dismissed by user.');
        },
      },
    };

    // If in development with mock keys and window.Razorpay fails, simulate checkout
    if (!window.Razorpay || key_id?.includes('mock')) {
      const confirmed = window.confirm(
        `[Development Sandbox Checkout]\nSimulate successful payment for ${planId.toUpperCase()} (₹${(amount / 100).toLocaleString('en-IN')})?`
      );
      if (confirmed) {
        rzpOptions.handler({
          razorpay_order_id: order_id,
          razorpay_payment_id: `pay_mock_${Date.now()}`,
          razorpay_signature: 'mock_valid_signature',
        });
      } else {
        onError?.('Checkout cancelled.');
      }
      return;
    }

    const rzp = new window.Razorpay(rzpOptions);
    rzp.open();
  } catch (err: any) {
    onError?.(err.message || 'Unexpected payment error occurred.');
  }
}
