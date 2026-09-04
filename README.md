# Site Aula de Deploy — Univassouras (ADS · Campus Maricá)

Site estático simples (HTML + CSS + JS puro, sem build e sem dependências) criado para a
aula de **Deploy** do curso de ADS. O objetivo é subir este site numa **VM Ubuntu no Azure**
e publicá-lo com **Apache**.

Inclui, na Home:
- Mensagem de boas-vindas para a turma;
- Um "terminal" decorativo mostrando os comandos de deploy;
- O **Jogo do Dado da Sorte** (2 a 6 jogadores, cada um escolhe um número do dado — quem acertar o número sorteado, vence).

## Estrutura

```
.
├── index.html
├── css/
│   └── style.css
├── js/
│   └── script.js
├── assets/
│   ├── logo.png     (logo oficial Univassouras)
│   └── logo.svg      (ícone/favicon)
└── README.md
```

## Rodando localmente

Não precisa de servidor nem instalação — basta abrir o `index.html` no navegador.
Opcionalmente, sirva com qualquer servidor estático, por exemplo:

```bash
python3 -m http.server 8080
```

## Deploy na VM Ubuntu (Azure) com Apache

### 1. Criar a VM no Azure
No portal do Azure: **Criar recurso → Máquina Virtual**
- Imagem: **Ubuntu Server (22.04 LTS)**
- Tamanho: B1s já é suficiente para este site estático
- Autenticação: SSH (chave pública) ou senha
- Em **Portas de entrada**, libere **22 (SSH)** e **80 (HTTP)**

### 2. Conectar via SSH
```bash
ssh <seu-usuario>@<ip-publico-da-vm>
```

### 3. Instalar o Apache
```bash
sudo apt update
sudo apt install apache2 -y
sudo systemctl enable --now apache2
```

Teste local na própria VM:
```bash
curl -I http://localhost
```

### 4. Enviar os arquivos do site para a VM
No seu computador (fora da VM), com o repositório já clonado:

```bash
git clone https://github.com/tiagocastroo/site-aula-deploy-povm.git
scp -r site-aula-deploy-povm/* <seu-usuario>@<ip-publico-da-vm>:/tmp/site
```

### 5. Publicar no diretório do Apache
De volta na VM:
```bash
sudo rm -rf /var/www/html/*
sudo cp -r /tmp/site/* /var/www/html/
sudo systemctl restart apache2
```

### 6. Acessar
Abra no navegador: `http://<ip-publico-da-vm>`

Pronto — site no ar! 🚀

## Licença

Uso livre para fins didáticos da disciplina.
