Night worker mobil için bir ui factory uygulamasıdır

Farklı telefon modelleri seçilebilmeli, ios android seçenekleri olmalı

alt tarafta tldraw olacak
güncel durum jsonda olarak gelmeli database gibi
  değişiklikleri uidan görebilmek istiyorum, git gibi düsün. bir json var sonuçta ui'ın güncel durumunu gösteren
  ui aslında güncel kod gibi dusun, yapılan değişiklikleri accept reejct mantığıyla yönetmek istiyorum
  delete kırmızı, yeni ekleme yeşil, değiştirme sarı gibi


BENCE OLACAK VE GUZEL BIR UYGULAMA OLACAK
KAPSAMI KUCUK TUTMAM LAZIM hemen ağır özelliklere yüklenmemem gerekli

kontrol edilebilme yüksek olmalı user her şeyi kontrol edebilmeli, üst üste binebilmeli yani,
  bir değişiklik geri alınabilmeli onaylamadan ilerleyememem lazım

ilk  hedef ui discovery agent'ı Loop'un ilk görevi eger existing proje üzerinden çalışıyorsa bu olmalı

agent teams yapısı ama context shared olmayacak sadece tek bir zeki model var context onda diğerleri beyin gücüne ihtiyaç duymayacak sekilde tek bir görevi yapıyor
bu sekilde governor en zeki model güncellendikçe provider tarafından genel kalite yükselecek
diğerleri sadece tek görevi yapıyor statik modellere sahip, ui discovery'nin görev tanımı çok keskin mevcut ekranlarla başlangıç yapmak istiyorum git getir yansıt bu kadar

MAIN_FEATURES
  Problem
    geceleri claude kotamı kullanamıyorum
    ui generation darboğaz
    fikirlerim var ama ui'a dökmek için çok deneme yapmak lazım
    Loop mantığıyla üretim yapmak istiyorum
  One liner
    Mobile focused
    React based -> diğer frameworklere geçiş olabilmeli
    Mediator product -> sen kendi frameworküne buradan bakarak geçirebilirsin
    Preview, ideatation, fast iteration
    Not a final product (ileride final product da olabilir ama burası bir jam ortamı)
    Ralph Loop ile geceleri çalışma
    Ui generation, için geceleri çalışan karanlık fabrika, geceleri kendi kendine  variantation, flow generation, gap finder, enhancer özelliklerini yerine getirebilmeli
    Istersen buradaki üretimini direkt webview ile gömersin ve mobil uygulaman hazır olur
  Preview Live ve Lock özelliği
    Live uygulamalar RIHTML(React in html) kullanacaklar ve bize whiteboardta onların animasyonlu halini göreceğiz
    Live uygulamalar bu sekilde çok ram harcar gerekirse onları preview'a çekmek istiyorum
    Lock özelliği ise değişik yapmaa burada ben çok memnunum buradan demek
  Mevcuttan devam edebilmeli
    Mevcut ekranları PREVIEW olarak içeri alırsın memnun olduklarını locklarsın
  Gap Finder
    Gap = olması gereken − var olan
    olması gereken -> ui best practices, apple hig, best practices for human design, ui audit'ing
    gap finder mesela kamera izinleri yoksa empty bir ekran ile izinleri almalı mesela
    ui'ın smooth olması için eksik ekranlarla veya eksik komponentlerle continuous feedback loop, user'ı boşlukta kaldığı beklediği yerleri bulmak
    Gap finder mevcut projenin live çalışmasından elde edilir screenshotlardan değil bunun için argent, expo mcp vs ile inceleme yapılır
  Ralph Loop
    EACH RALPH LOOP MUST HAVE GATE/GATES
    Flow üreten loop 'un çalışması için gate'ler olmak zorunda örneğin `tsc --noEmit` bir typecheck gate'i bu olmadan mantıklı değil
    bu gatelerden bazıları base gate yani her loopta olacak
    gateleri prompt esnasında verebilmen lazım, gateleri #gate: şeklinde en altta vereceksin gatelerin kendi yeri olmalı
    GATE(Olur koşul)
  Screen-Note Drill Down
    Ekrana iki tık yaparak ona dair not alabilmelisin, ekranlara ait kafanda kurduğun tasarım, ideatation, mock tasarım(sağda mock tasarım)
  Context = Mevcut kod, proje
    sonradan eklemeni istemiyorum projeni seç onun üstünden çalışalım istiyorum
  (GPT)EDIT/REFINE -> yerinde iyileştirme -> sadece live ise yapılabilir -> butonu biraz büyüt
    Sıfırdan üretmek değil, var olan ekranı küçük adımlarla düzeltmek bunu inplace yapmayacak edit var olanı bozmamalı asla
    edit kısmının ayrı bir ekranı olmalı versiyon versiyon
    yani butonu büyüttü
    edit aynı ekranın duplikasyonu üzerinde yapılıyor olsun bu stack yapısı gibi dusun editler atomik olduğu için en son hangi değişiklikleri beğendiyse onları seçip      base'e collapse edebilmeli en son accept ettiğinde o ekrana uygulanmış olacak değişiklikler
  (GPT) Fork, çoğaltma duplicate
  (GPT) State üretimi
    Stateler sağ alta doğru stack gibi olmalı, isterse genişletir stateler aynı ekrana ait farklı durumlar
    Main
      Data Fetching
        Disabled
          empty
            error
              success
  (GPT) Variantation
    Dark mode
    Layout A/B
    Responsiveness

  WhiteBoard
    bir tane tamamen sağa doğru giden bir flow var bu flow main flow diye geçer ve happy path flowu burada olur buranın sonunda dallanma olabilir vs vs
    main flow direkt ilk açılıştan başlar
    Her ekranın ismi olmalı, her ekran bir kartın içinde olmalı
    Duplikasyon özelliği 
    Flowlara ekran ekleme
    flowlar yatay iken
    stateler dikey olmalı
  (GPT)
    1. Flow'a ekran ekleyip bağlama (link) — node ekleme + edge çekme. Sık ama ekran-içi iterasyondan daha az; çünkü bir flow kurulduktan sonra asıl zaman ekranların kendisinde geçer.
    2. İçerik / data doldurma — lorem ipsum'u gerçekçi veriyle değiştirmek, mock data üretmek. Placeholder'dan "gerçek" görünüme geçiş.
    3. Global restyle / token swap — renk, tipografi, spacing'i tek seferde tüm ekranlara uygulamak. Tema değişince hepsinin güncellenmesi.
    4. Placeholder / stub ekleme — senin dediğin. UI daha yokken flow'da yeri rezerve etmek, sonra doldurmak.
    5. Flow'u yeniden yapılandırma — ekranı erkene/geç al, dallandır (branch), yolları birleştir, koşullu dal ekle.



v2 de frontmatter'ı daha iyi kullanmanı istiyorum modellere dahil hangi agentta hangi modeli kullanıyorsan açık şekilde frontmatterda belirt
çok token context harcandı benim gördüüğüm kadarıyla
governor Fable kalmalı bunu asla es geçme ASLA governor en güncel model kalmalı en akıllı model olmalı diğerleri fable olmamalı

sen apple hig için vs tik attırmamalısın
her agent için en basta faydalı olabilecek mcpleri skilleri frontmatter'a ekle ilgili mcplerin agentlar tarafından kullanılabildiğini doğrula
mesela expo mcp'ye kesin ihtiyacın olacak veya argent mcp'ye ihtiyacın olacak ya da expo mcp argent yerine yeterli gelecek bilmiyorum
expo mcp'yi ekleyeceğine eminim ilgili agent'a
bunun gibi agentların işini kolaylaştıracak kısımları önceden araştır ve frontmatterda agent'a bunları ekle, agentlar gerekli gördüğü yerde bu mcpleri vs kullansınlar
mesela apple hig uyumu için skill vardır yükle

bir agent'ın skille ijtiyaç duyması durumunda governor'a gidip onay alırsa bu yönde bir gelişim katedebilir

şimdi ek olarak ui için tldraw kullanmanı isteyeceğim istersen mermaid kolayına geliyorsa onunla çalış başta ama bu tkdraw'ı güncel tutman çok önemli
tldraw'ı figma ui dashboard gibi kullanacağız, app'in mevcut ekranlarına ait screenshotlar burada olacak nereden nereye gidiliyor vs

ilgili flowları tldrawda göstereceksin yani screenshotlar ile
buradaki amaç direkt insan gözüyle güncel durumu takip edebilmek hemen

Her iterasyonda(yani en en en basta) önce tldraw var mı varsa mevcut akış ile uyumlu mu bunu kontrol edeceksin
burada ek olarak şu var mevcut akışı çıkardığından emin olduktan sonra 
artık previewlar expo değil html içinde react ile yazacaksın en son onları ben expoya çevirimii yaparım sen react in html ile preview yapabilirsin
tldraw içinde ürettiğin her varyantı ve flow'u göstereceksin biz anlayacağız yani 3 farklı varyantın olduğunu
burada path gibi akışı göstermen çok önemli anlayacağız yani mevcut ui akışı nasıl yeni ekranlar nedir veya değiştirilen ekranlar nedir
tldrawda locked olanları gri işaretle yeni gelenler yeşil silinenler kırmızı değiştirlenler sarı github gibi yani ui anlamında ürettiğmiz çıktının yeni versiyonunun rahat göreceğiz
kısacası bunu anlamadıysan çok falz asoru sorabilirsin, 


ek olarak sana aşağıda v1'in çıktısına göre benim analiz ettiğim geliştirilebilecek noktalar var bunlaron hepsi geliştirilebilr demek deoğru değil
aralarında seçme yapmamız lazım o yüzden en çok etkiyi yaratacak mantıklı olanları özellikle kullanacağız


İnceledim. Genel hüküm: **factory fikri güçlü**, ama şu an “Claude Code Agent Teams + .claude hooks” etrafında fazla şekillenmiş. Minimax / DeepSeek / Composer gibi daha cömert modellerle çalıştırmak için asıl iyileştirme promptları kısaltmak değil; **runtime’ı Claude’dan ayırıp, task/state/verify sistemini model-agnostic hale getirmek**.

Ben zip içinde şunları doğruladım: `tsc --noEmit` temiz, `token-lint` temiz. Ama zip 60 MB; açıldığında `node_modules` yaklaşık 187 MB ve 15k+ dosya getiriyor. Factory’nin kendi gerçek kaynakları `node_modules` hariç yaklaşık 311 KB. Yani token/arama maliyeti açısından ilk net optimizasyon: **node_modules asla context’e veya archive’a girmemeli**.
