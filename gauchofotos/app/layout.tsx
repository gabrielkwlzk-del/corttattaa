import './style.css';
import './brand.css';
export const metadata={title:'Esporte Show Online',description:'Fotos esportivas para guardar cada momento.',icons:{icon:'/brand/logo.webp'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}
