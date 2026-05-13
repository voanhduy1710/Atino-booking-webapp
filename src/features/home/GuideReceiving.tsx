import { useEffect } from 'react'
import { Navbar } from '@/shared/components/Navbar'
import { SUPPLIER_TABS } from '@/shared/constants/supplierTabs'

export default function GuideReceiving() {
  useEffect(() => {
    document.title = 'Quy trÃ¬nh giao nháº­n hÃ ng â€” Atino Booking'
  }, [])

  return (
    <div className="min-h-screen flex flex-col bg-[#FFF5FF]">
      <Navbar tabs={SUPPLIER_TABS} activeTab="guide" />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
        <div className="bg-white border border-[#E0E0E0] rounded-lg px-6 py-10">
          <h1 className="text-2xl font-bold mb-2">Quy trÃ¬nh giao nháº­n hÃ ng</h1>
          <p className="text-[#888888] text-sm mb-8">
            Quy trÃ¬nh chuáº©n khi giao hÃ ng Ä‘áº¿n kho Atino.
          </p>

          <div className="space-y-8">
            {[
              {
                step: 1,
                title: 'ÄÄƒng kÃ½ trÆ°á»›c khi Ä‘áº¿n',
                desc: 'NhÃ  cung cáº¥p pháº£i hoÃ n thÃ nh Ä‘Äƒng kÃ½ giao hÃ ng trÃªn há»‡ thá»‘ng. ÄÆ¡n hÃ ng cáº§n Ä‘Æ°á»£c xÃ¡c nháº­n bá»Ÿi nhÃ¢n viÃªn kho trÆ°á»›c khi Ä‘áº¿n giao.',
              },
              {
                step: 2,
                title: 'Äáº¿n kho Ä‘Ãºng khung giá» Ä‘Ã£ Ä‘Äƒng kÃ½',
                desc: 'Xuáº¥t trÃ¬nh mÃ£ QR hoáº·c mÃ£ booking cho nhÃ¢n viÃªn kho táº¡i cá»•ng. HÃ ng hÃ³a pháº£i Ä‘Ãºng chá»§ng loáº¡i vÃ  sá»‘ lÆ°á»£ng Ä‘Ã£ Ä‘Äƒng kÃ½.',
              },
              {
                step: 3,
                title: 'NhÃ¢n viÃªn kho xÃ¡c nháº­n nháº­n hÃ ng',
                desc: 'NhÃ¢n viÃªn sáº½ kiá»ƒm tra, Ä‘áº¿m sá»‘ lÆ°á»£ng thá»±c nháº­n vÃ  xÃ¡c nháº­n trÃªn há»‡ thá»‘ng. Náº¿u cÃ³ chÃªnh lá»‡ch, sáº½ Ä‘Æ°á»£c ghi nháº­n vÃ  xá»­ lÃ½ theo chÃ­nh sÃ¡ch cá»§a Atino.',
              },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex gap-5">
                <div className="flex-shrink-0 w-9 h-9 rounded-full border-2 border-black flex items-center justify-center font-bold text-sm">
                  {step}
                </div>
                <div>
                  <h2 className="font-semibold mb-1">{title}</h2>
                  <p className="text-[#888888] text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 p-4 border border-[#E0E0E0] rounded-lg bg-[#F5F5F5]">
            <p className="text-sm text-[#888888]">
              <strong className="text-black">LÆ°u Ã½:</strong> HÃ ng giao thiáº¿u hoáº·c khÃ´ng Ä‘Ãºng chá»§ng loáº¡i sáº½ bá»‹ tráº£ vá».
              Vui lÃ²ng Ä‘áº¿n Ä‘Ãºng khung giá» Ä‘Ã£ chá»n. Trá»… giá» cÃ³ thá»ƒ bá»‹ tá»« chá»‘i nháº­n hÃ ng.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
