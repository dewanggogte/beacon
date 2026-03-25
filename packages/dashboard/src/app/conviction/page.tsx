import { redirect } from 'next/navigation';
export default function ConvictionPage() {
  redirect('/rankings?preset=high-conviction');
}
