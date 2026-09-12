const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "cortta-pro-dev-secret-change-me";

const db = new Database(path.join(__dirname, "cortta.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_name TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS barbers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  specialty TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  duration INTEGER NOT NULL DEFAULT 30,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  client_id INTEGER,
  barber_id INTEGER,
  service_id INTEGER,
  starts_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  client_id INTEGER,
  service_id INTEGER,
  amount REAL NOT NULL,
  payment_method TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
`);

app.use(express.json({limit:"100kb"}));
app.use((req,res,next)=>{
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("X-Frame-Options","SAMEORIGIN");
  next();
});
app.use(express.static(__dirname));

app.get("/api/health",(req,res)=>res.json({ok:true,service:"cortta-pro-api"}));

function auth(req,res,next){
  const header=req.headers.authorization||"";
  const token=header.startsWith("Bearer ") ? header.slice(7) : null;
  if(!token) return res.status(401).json({error:"Não autenticado"});
  try { req.user=jwt.verify(token,JWT_SECRET); next(); }
  catch { return res.status(401).json({error:"Sessão inválida"}); }
}

app.post("/api/auth/register", async (req,res)=>{
  try{
    const {shopName,name,email,password}=req.body;
    if(!shopName||!name||!email||!password||password.length<6)
      return res.status(400).json({error:"Preencha os campos corretamente."});
    const exists=db.prepare("SELECT id FROM users WHERE email=?").get(email.toLowerCase());
    if(exists) return res.status(409).json({error:"Este e-mail já está cadastrado."});
    const hash=await bcrypt.hash(password,10);
    const info=db.prepare("INSERT INTO users(shop_name,name,email,password_hash) VALUES(?,?,?,?)")
      .run(shopName.trim(),name.trim(),email.toLowerCase().trim(),hash);
    const user={id:info.lastInsertRowid,shopName,name,email:email.toLowerCase().trim()};
    const token=jwt.sign(user,JWT_SECRET,{expiresIn:"7d"});
    res.json({token,user});
  }catch(e){res.status(500).json({error:"Erro ao criar conta."});}
});

app.post("/api/auth/login", async (req,res)=>{
  try{
    const {email,password}=req.body;
    const row=db.prepare("SELECT * FROM users WHERE email=?").get((email||"").toLowerCase().trim());
    if(!row || !(await bcrypt.compare(password||"",row.password_hash)))
      return res.status(401).json({error:"E-mail ou senha incorretos."});
    const user={id:row.id,shopName:row.shop_name,name:row.name,email:row.email};
    const token=jwt.sign(user,JWT_SECRET,{expiresIn:"7d"});
    res.json({token,user});
  }catch(e){res.status(500).json({error:"Erro ao entrar."});}
});

app.get("/api/me",auth,(req,res)=>{
  const row=db.prepare("SELECT id,shop_name AS shopName,name,email,created_at FROM users WHERE id=?").get(req.user.id);
  res.json({user:row});
});

app.get("/api/dashboard",auth,(req,res)=>{
  const uid=req.user.id;
  const clients=db.prepare("SELECT COUNT(*) c FROM clients WHERE user_id=?").get(uid).c;
  const barbers=db.prepare("SELECT COUNT(*) c FROM barbers WHERE user_id=? AND active=1").get(uid).c;
  const services=db.prepare("SELECT COUNT(*) c FROM services WHERE user_id=? AND active=1").get(uid).c;
  const sales=db.prepare("SELECT COALESCE(SUM(amount),0) total FROM sales WHERE user_id=?").get(uid).total;
  const today=new Date().toISOString().slice(0,10);
  const appointments=db.prepare("SELECT COUNT(*) c FROM appointments WHERE user_id=? AND starts_at LIKE ? AND status='scheduled'").get(uid,`${today}%`).c;
  res.json({clients,barbers,services,sales:Number(sales),appointments});
});

app.get("/api/barbers",auth,(req,res)=>res.json(db.prepare("SELECT id,name,phone,specialty,active FROM barbers WHERE user_id=? ORDER BY name").all(req.user.id)));
app.post("/api/barbers",auth,(req,res)=>{
  const {name,phone="",specialty=""}=req.body;
  if(!name) return res.status(400).json({error:"Nome do barbeiro é obrigatório."});
  const info=db.prepare("INSERT INTO barbers(user_id,name,phone,specialty) VALUES(?,?,?,?)").run(req.user.id,name,phone,specialty);
  res.json(db.prepare("SELECT id,name,phone,specialty,active FROM barbers WHERE id=?").get(info.lastInsertRowid));
});
app.delete("/api/barbers/:id",auth,(req,res)=>{
  db.prepare("DELETE FROM barbers WHERE id=? AND user_id=?").run(req.params.id,req.user.id);
  res.json({ok:true});
});

app.get("/api/clients",auth,(req,res)=>res.json(db.prepare("SELECT id,name,phone,email,notes FROM clients WHERE user_id=? ORDER BY name").all(req.user.id)));
app.post("/api/clients",auth,(req,res)=>{
  const {name,phone="",email="",notes=""}=req.body;
  if(!name)return res.status(400).json({error:"Nome do cliente é obrigatório."});
  const info=db.prepare("INSERT INTO clients(user_id,name,phone,email,notes) VALUES(?,?,?,?,?)").run(req.user.id,name,phone,email,notes);
  res.json(db.prepare("SELECT id,name,phone,email,notes FROM clients WHERE id=?").get(info.lastInsertRowid));
});

app.get("/api/services",auth,(req,res)=>res.json(db.prepare("SELECT id,name,price,duration,active FROM services WHERE user_id=? ORDER BY name").all(req.user.id)));
app.post("/api/services",auth,(req,res)=>{
  const {name,price=0,duration=30}=req.body;
  if(!name)return res.status(400).json({error:"Nome do serviço é obrigatório."});
  const info=db.prepare("INSERT INTO services(user_id,name,price,duration) VALUES(?,?,?,?)").run(req.user.id,name,Number(price)||0,Number(duration)||30);
  res.json(db.prepare("SELECT id,name,price,duration,active FROM services WHERE id=?").get(info.lastInsertRowid));
});

app.get("/api/appointments",auth,(req,res)=>res.json(db.prepare(`
SELECT a.id,a.starts_at,a.status,a.notes,c.name client_name,b.name barber_name,s.name service_name,s.price
FROM appointments a LEFT JOIN clients c ON c.id=a.client_id LEFT JOIN barbers b ON b.id=a.barber_id
LEFT JOIN services s ON s.id=a.service_id WHERE a.user_id=? ORDER BY a.starts_at DESC`).all(req.user.id)));
app.post("/api/appointments",auth,(req,res)=>{
  const {clientId=null,barberId=null,serviceId=null,startsAt,notes=""}=req.body;
  if(!startsAt)return res.status(400).json({error:"Data e horário são obrigatórios."});
  const info=db.prepare("INSERT INTO appointments(user_id,client_id,barber_id,service_id,starts_at,notes) VALUES(?,?,?,?,?,?)")
    .run(req.user.id,clientId,barberId,serviceId,startsAt,notes);
  res.json({id:info.lastInsertRowid});
});

app.get("/api/sales",auth,(req,res)=>res.json(db.prepare(`
SELECT sa.id,sa.amount,sa.payment_method,sa.created_at,c.name client_name,s.name service_name
FROM sales sa LEFT JOIN clients c ON c.id=sa.client_id LEFT JOIN services s ON s.id=sa.service_id
WHERE sa.user_id=? ORDER BY sa.created_at DESC`).all(req.user.id)));
app.post("/api/sales",auth,(req,res)=>{
  const {clientId=null,serviceId=null,amount,paymentMethod=""}=req.body;
  if(amount===undefined || Number(amount)<0)return res.status(400).json({error:"Valor inválido."});
  const info=db.prepare("INSERT INTO sales(user_id,client_id,service_id,amount,payment_method) VALUES(?,?,?,?,?)")
    .run(req.user.id,clientId,serviceId,Number(amount),paymentMethod);
  res.json({id:info.lastInsertRowid});
});

app.post("/api/auth/logout",(req,res)=>res.json({ok:true}));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"index.html")));
if (require.main === module) {
  app.listen(PORT,()=>console.log(`Cortta Pro rodando em http://localhost:${PORT}`));
}

module.exports = app;
