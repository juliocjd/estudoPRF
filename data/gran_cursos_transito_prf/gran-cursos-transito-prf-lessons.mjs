const PROVIDER = 'Gran Cursos';
const DISCIPLINE = 'Legislação de Trânsito';
const PROFESSOR = 'Prof. Paulo Sérgio';
const SOURCE = 'Lista de aulas Gran Cursos informada pelo usuário';

const ESSENTIAL = numbers(`
25 105 106 107 108 109 110 111 178 183 179 180 127
172 173 97 19
98 99 171 118 119 120 121 144 145 146 147 148 38 39 40 41 42 43 44 45 46 47 48
49 50 51 52 53 54 55 56 57 58 59 60 61 62
26 149 150 151 152 153 27 130 131 28 137 138 139 140 141 142 143
93 94 95 174 175 176 177 18 181 182
`);

const IMPORTANT = numbers(`
1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 20 21 22 23 24
29 30 31 32 33 34 35 36 37
63 64 65 66 67 70 71 83 84 85 86 87 88 89 90 91 96 100 101
115 116 117 122 123 124 125 156 157 158 159 160 161 162 163 164 165 166 167 168 169 170
`);

const REVIEW = numbers(`
68 69 72 73 74 75 76 77 78 79 80 81 82 92 102 103 104 112 113 114 126
128 129 132 133 134 135 136 154 155
`);

const ESSENTIAL_ALTISSIMA = numbers(`
25 105 106 107 108 109 110 111 178 183 179 180 127
172 173 97 19
98 99 118 119 120 121 144 145 146 147 148
49 50 51 52 53 54 55 56 57 58 59 60 61 62
`);

const ESSENTIAL_ALTA = numbers(`
171
38 39 40 41 42 43 44 45 46 47 48
26 149 150 151 152 153
27 130 131
28 137 138 139 140 141 142 143
93 94 95
174 175 176 177
18 181 182
`);

const AXIS_GROUPS = [
  ['Carga, peso, dimensões e amarração', 'Temas de peso, dimensões, amarração, cargas externas e transporte de carga.', numbers('25 105 106 107 108 109 110 111 178 183 179 180 127')],
  ['Tacógrafo e jornada do motorista', 'Cronotacógrafo, tempo de direção, descanso e regras do motorista profissional.', numbers('172 173 97 19')],
  ['Fiscalização eletrônica, autuação, multa e processo administrativo', 'Fiscalização, videomonitoramento, autuação, multas, recursos, MBFT e processos administrativos.', numbers('98 99 171 118 119 120 121 144 145 146 147 148 38 39 40 41 42 43 44 45 46 47 48')],
  ['Infrações de trânsito', 'Infrações do CTB, penalidades associadas e pontos de alta recorrência em prova.', numbers('49 50 51 52 53 54 55 56 57 58 59 60 61 62')],
  ['Equipamentos, identificação e segurança veicular', 'Equipamentos obrigatórios, vidros, placas, iluminação e identificação veicular.', numbers('26 149 150 151 152 153 27 130 131 28 137 138 139 140 141 142 143')],
  ['Pegadinhas fortes', 'Álcool, suspensão/cassação, transporte de crianças, documentos veiculares e pontos com alta chance de confusão.', numbers('93 94 95 174 175 176 177 18 181 182')],
  ['Base do CTB e competências', 'Base normativa inicial do CTB e competências dos órgãos de trânsito.', numbers('1 2 3 4 5 6 7 8')],
  ['Regras de circulação', 'Normas gerais de circulação, conduta, luzes, buzina, imobilização e motocicletas.', numbers('9 10 11 12 13 14 15 16 17')],
  ['Pedestres, campanhas, sinalização e engenharia', 'Pedestres, educação, sinalização, engenharia, manuais de sinalização e PNATRANS.', numbers('20 21 22 23 83 84 85 86 87 88 89 90 91 156 169')],
  ['Registro, licenciamento, escolares, motofrete e habilitação', 'Registro/licenciamento, escolares, motofrete, habilitação e documentos veiculares.', numbers('29 30 31 32 33 34 35 36 37 157 158 159 160 161 162 163 164 165 166 167 181 182')],
  ['Crimes de trânsito e disposições finais', 'Crimes de trânsito e disposições finais do CTB.', numbers('63 64 65 66 67 68 69')],
  ['Revisão e complementares', 'Aulas de resumo, resoluções complementares e temas de menor incidência no recorte.', numbers('72 73 74 75 76 77 78 79 80 81 82 92 102 103 104 112 113 114 126 128 129 132 133 134 135 136 154 155')],
  ['Documentos, avarias e temas específicos complementares', 'Avarias, capacete, vistoria, leis específicas, licenciamento e temas complementares.', numbers('96 100 101 115 116 117 122 123 124 125 168 170')]
];

const RECOMMENDED_GROUPS = [
  ['Carga, peso, dimensões e amarração', numbers('25 105 106 107 108 109 110 111 178 183 179 180 127')],
  ['Tacógrafo e jornada', numbers('172 173 97 19')],
  ['Fiscalização, multa e processo', numbers('98 99 171 118 119 120 121 144 145 146 147 148 38 39 40 41 42 43 44 45 46 47 48')],
  ['Infrações', numbers('49 50 51 52 53 54 55 56 57 58 59 60 61 62')],
  ['Equipamentos, vidros, placas e iluminação', numbers('26 149 150 151 152 153 27 130 131 28 137 138 139 140 141 142 143')],
  ['Pegadinhas', numbers('93 94 95 174 175 176 177 18 181 182')],
  ['Base do CTB e circulação', numbers('1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 20 21 22 23 24')],
  ['Registro, licenciamento, habilitação e demais temas', numbers('29 30 31 32 33 34 35 36 37 63 64 65 66 67 68 69 70 71 83 84 85 86 87 88 89 90 91 96 100 101 115 116 117 122 123 124 125 156 157 158 159 160 161 162 163 164 165 166 167 168 169 170')],
  ['Revisão rápida e complementares', numbers('68 69 72 73 74 75 76 77 78 79 80 81 82 92 102 103 104 112 113 114 126 128 129 132 133 134 135 136 154 155')]
];

const RAW_LESSONS = `
1|CTB - Apresentação|00:33:44
2|CTB - Art. 1º ao 4º|00:31:06
3|CTB - Art. 5º ao 9º|00:33:24
4|CTB - Art. 10 ao 12|00:33:47
5|CTB - Art. 13 ao 19|00:36:05
6|CTB - Art. 20|00:34:56
7|CTB - Art. 21 e 22|
8|CTB - Art. 23 ao 25 - A|00:32:52
9|CTB - Art. 26 ao 29|00:30:16
10|CTB - Art. 29 - Regras de Circulação|00:31:05
11|CTB - Art. 29 - Regras de Livre Circulação|00:31:25
12|CTB - Art. 30 Ao 37 - Regras de Circulação|00:30:45
13|CTB - Art. 38 ao 39 - Regras de Circulação|00:30:06
14|CTB - Art. 40 - Uso de Luzes no Veículo|
15|CTB - Art. 41 ao 44 - A - Uso da Buzina/Freada Brusca|00:30:24
16|CTB - Art. 45 ao 50 - Imobilização na Via|00:25:17
17|CTB - Art. 51 a 57 - Motocicletas, Motonetas e Ciclomotores|00:31:02
18|CTB - Art. 58 a 64 - Classificação das Vias e Transporte de Crianças|00:31:30
19|CTB - Art. 65 a 67 - E - Competições na Via e Regras para Motoristas Profissionais|00:34:11
20|CTB - Art. 68 a 77 - Pedestres e Campanhas Educativas de Trânsito|00:35:01
21|CTB - Art. 78 a 83 - Sinalização de Trânsito|
22|CTB - Art. 84 a 90 - Sinalização de Trânsito II|00:31:35
23|CTB - Art.91 ao 95 - Sinalização e Engenharia de Trânsito|00:27:28
24|CTB - Art.96 ao 98 - Classificação e Características dos Veículos|00:26:00
25|CTB - Art. 99 ao 102 - Pesos e Dimensões do Veículo dos Veículos|00:32:23
26|CTB - Art. 103 ao 105 - Equipamentos Obrigatórios|00:33:03
27|CTB - Art. 106 ao 113 - Áreas Envidraçadas dos Veículos|00:31:40
28|CTB - Art. 114 ao 115 - Identificação Veicular|
29|CTB - Art. 116 ao 119 - Circulação Internacional de Veículos|00:30:00
30|CTB - Art. 120 ao 125 - Registro e Licenciamento de Veículos|00:31:14
31|CTB - Art. 126 ao 131 - Registro e Licenciamento de Veículos|00:30:31
32|CTB - Art. 131 ao 135 - Registro e Licenciamento de Veículos|00:34:18
33|CTB - Art. 136 ao 139 - B - Condução de Escolares e Moto - frete|00:32:04
34|CTB - Art. 140 ao 143 - Habilitação de Condutores|
35|CTB - Art. 143 ao 147 - Habilitação de Condutores II|00:30:46
36|CTB - Art. 147 ao 148 - Habilitação de Condutores III|00:31:07
37|CTB - Art. 148 - A ao 160 - Habilitação de Condutores IV|00:36:37
38|CTB - Art. 256 ao 257 - Penalidades Administrativas|00:30:49
39|CTB - Art. 257 ao 259 - Penalidades Administrativas II|00:30:26
40|CTB - Art. 257 ao 261 - Penalidades Administrativas III|00:31:10
41|CTB - Art. 261 ao 266 - Penalidades Administrativas IV|
42|CTB - Art. 267 ao 268A - Penalidades Administrativas V|00:34:42
43|CTB - Art. 269 ao 270 - Medidas Administrativas|00:30:29
44|CTB - Art. 271 ao 274 - Medidas Administrativas II|00:31:06
45|CTB - Art. 275 ao 279A - Medidas Administrativas III|00:33:24
46|CTB - Art. 280 ao 282 - Processos Administrativos (Atuação)|
47|CTB - Art. 282 ao 285 - Processos Administrativos (Recursos)|00:30:13
48|CTB - Art. 285 ao 290 - Processos Administrativos (Recursos)|00:31:06
49|CTB - Art.161 ao 162 - Infrações de Trânsito|00:31:30
50|CTB - Art.163 ao 165 - D - Infrações de Trânsito|00:31:55
51|CTB - Art.166 ao 170 - Infrações de Trânsito|00:30:29
52|CTB - Art.171 ao 177 - Infrações de Trânsito|00:31:14
53|CTB - Art.178 ao 181 - Infrações de Trânsito|
54|CTB - Art.181 ao 190 - Infrações de Trânsito|00:30:40
55|CTB - Art.191 ao 203 - Infrações de Trânsito|00:31:19
56|CTB - Art. 204 ao 214 - Infrações de Trânsito|00:31:39
57|CTB - Art. 215 Ao 220 - Infrações de Trânsito|00:30:52
58|CTB - Art. 220 Ao 229 - Infrações de Trânsito|00:31:00
59|CTB - Art. 230 Incisos I Ao XV - Infrações de Trânsito|
60|CTB - Art. 230 Ao 232 - Infrações de Trânsito|00:30:53
61|CTB - Art. 233 ao 244 - Infrações de Trânsito|00:30:44
62|CTB - Art. 244 ao 255 - Infrações de Trânsito|00:34:41
63|CTB - Art. 291 ao 293 - Crimes de Trânsito|00:30:44
64|CTB - Art. 294 ao 300 - Crimes de Trânsito|00:32:19
65|CTB - Art. 301 ao 303 - Crimes de Trânsito|
66|CTB - Art. 304 ao 307 - Crimes de Trânsito|00:31:07
67|CTB - Art. 308 ao 312 - Crimes de Trânsito|00:34:48
68|CTB - Art. 313 ao 326 (A) - Disposições Finais|00:33:21
69|CTB - Art. 326 (B) ao Art. 340 - Disposições Finais|00:28:57
70|Anexo I - CTB - Conceitos e Definições|00:30:17
71|Anexo I - CTB - Conceitos e Definições II|00:31:32
72|CTB - Aulas Resumo|
73|CTB - Aulas Resumo|00:30:53
74|CTB - Aulas Resumo|00:30:59
75|CTB - Aulas Resumo|00:29:22
76|CTB - Aulas Resumo|00:31:29
77|CTB - Aulas Resumo|00:31:13
78|CTB - Aulas Resumo|00:30:43
79|CTB - Aulas Resumo|
80|CTB - Aulas Resumo|00:31:37
81|CTB - Aulas - Resumo|00:31:46
82|CTB - Aulas - Resumo|00:32:16
83|CTB - Resolução CONTRAN 973/2022 - Manuais Brasileiros de Sinalização de Trânsito|00:31:00
84|CTB - Resolução CONTRAN 973/2022 - Manuais Brasileiros de Sinalização de Trânsito II|00:30:56
85|CTB - Resolução CONTRAN 973/2022 - Manuais Brasileiros de Sinalização de Trânsito III|
86|CTB - Resolução CONTRAN 973/2022 - Manuais Brasileiros de Sinalização de Trânsito IV|00:30:29
87|CTB - Resolução CONTRAN 973/2022 - Manuais Brasileiros de Sinalização de Trânsito V|00:32:25
88|CTB - Resolução CONTRAN 973/2022 - Manuais Brasileiros de Sinalização de Trânsito VI|00:30:19
89|CTB - Resolução CONTRAN 973/2022 - Manuais Brasileiros de Sinalização de Trânsito VII|00:30:27
90|CTB - Resolução CONTRAN 973/2022 - Manuais Brasileiros de Sinalização de Trânsito VIII|
91|CTB - Resolução CONTRAN 973/2022 - Manuais Brasileiros de Sinalização de Trânsito IX|00:33:57
92|Resolução do Contran nº 242/2007|00:17:45
93|Resolução do Conselho Nacional de Trânsito (CONTRAN) e suas alterações: 432/2013|00:30:30
94|Resolução do Conselho Nacional de Trânsito (CONTRAN) e suas alterações: 432/2013|00:31:17
95|Resolução do Conselho Nacional de Trânsito (CONTRAN) e suas alterações: 432/2013|00:30:33
96|Resolução do Contran nº 508/14|00:32:40
97|Resolução do Conselho Nacional de Trânsito (CONTRAN) e suas alterações: 525/2015|00:31:59
98|Resolução do Conselho Nacional de Trânsito (CONTRAN) e suas alterações: Anexo I; 798/2020|00:30:22
99|Resolução do Conselho Nacional de Trânsito (CONTRAN) e suas alterações: Anexo I; 798/2020|00:32:52
100|Resolução Contran nº 810/2020 - Avarias no Veículo|00:30:39
101|Resolução Contran nº 810/2020 - Avarias no Veículo II|00:37:10
102|Resolução do Contran nº 811/20|00:30:47
103|Resolução do Contran nº 811/20 II|00:30:33
104|Resolução do Contran nº 811/20 III|00:22:00
105|Resolução do CONTRAN: Res. 882/2020|00:31:21
106|Resolução do CONTRAN: Res. 882/2020|00:33:07
107|Resolução do CONTRAN: Res. 882/2020|00:30:54
108|Resolução do CONTRAN: Res. 882/2020|00:30:49
109|Resolução do CONTRAN: Res. 882/2020|00:32:28
110|Resolução do CONTRAN: Res. 882/2020|00:30:21
111|Resolução do CONTRAN: Res. 882/2020|00:36:17
112|Resolução do Contran nº 886/21 alterada pela Resolução nº 976/2022|00:40:28
113|Resolução do Contran Nº 911/2022 - Circulação de Veículos Novos Antes do Registro|00:31:09
114|Resolução do Contran Nº 911/2022 - Circulação de Veículos Novos Antes do Registro II|00:24:11
115|Resolução do Contran nº 916/2022|00:30:53
116|Resolução do Contran nº 916/2022 II|00:30:36
117|Resolução do Contran nº 916/2022 III|00:31:59
118|Resolução do Contran Nº 918/2022 - Processos Administrativos e Recursos|00:30:17
119|Resolução do Contran Nº 918/2022 - Processos Administrativos e Recursos II|00:31:28
120|Resolução do Contran Nº 918/2022 - Processos Administrativos e Recursos III|00:30:46
121|Resolução do Contran Nº 918/2022 - Processos Administrativos e Recursos IV|00:31:03
122|Resolução do Contran Nº 940/2022 - Uso do Capacete para Condutor e Passageiro de Motos|00:29:33
123|Resoluções do CONTRAN: 941/2022 - Vistoria Veicular|00:32:04
124|Resoluções do CONTRAN: 941/2022 - Vistoria Veicular II|00:31:06
125|Resoluções do CONTRAN: 941/2022 - Vistoria Veicular III|00:30:32
126|Resolução do CONTRAN: 951/2022 e seu anexo|00:29:26
127|Resolução do Contran nº 955/22 - Transporte de carga nas partes externas (CONTRAN)|00:31:53
128|Resolução do Contran nº 958/22|00:32:47
129|Resolução do Contran nº 958/22 II|00:26:36
130|Resolução do Contran Nº 960/2022 - Exigências para as Áreas Envidraçadas dos Veículos|00:30:29
131|Resolução do Contran Nº 960/2022 - Exigências para as Áreas Envidraçadas dos Veículos II|00:32:41
132|Resoluções do CONTRAN: 968/2022|00:31:19
133|Resoluções do CONTRAN: 968/2022|00:30:39
134|Resoluções do CONTRAN: 968/2022|00:30:26
135|Resoluções do CONTRAN: 968/2022|00:30:30
136|Resoluções do CONTRAN: 968/2022|00:43:19
137|Resolução do Contran nº 969/22 e Anexos I e II - Sistema de Placas de Identificação de Veículos|00:30:23
138|Resolução do Contran nº 969/22 e Anexos I e II - Sistema de Placas de Identificação de Veículos II|00:30:25
139|Resolução do Contran nº 969/22 e Anexos I e II - Sistema de Placas de Identificação de Veículos III|00:31:09
140|Resolução do Contran nº 969/22 e Anexos I e II - Sistema de Placas de Identificação de Veículos IV|00:30:27
141|Resolução do Contran nº 969/22 e Anexos I e II - Sistema de Placas de Identificação de Veículos V|00:28:39
142|Resolução CONTRAN nº 970/2022 - Sistema de Iluminação dos Veículos|00:30:58
143|Resolução CONTRAN nº 970/2022 - Sistema de Iluminação dos Veículos II|00:33:07
144|Resolução CONTRAN nº 985/2022 - Manual Brasileiro de Fiscalização de Trânsito|00:30:24
145|Resolução CONTRAN nº 985/2022 - Manual Brasileiro de Fiscalização de Trânsito II|00:30:51
146|Resolução CONTRAN nº 985/2022 - Manual Brasileiro de Fiscalização de Trânsito III|00:30:55
147|Resolução CONTRAN nº 985/2022 - Manual Brasileiro de Fiscalização de Trânsito IV|00:32:12
148|Resolução CONTRAN nº 985/2022 - Manual Brasileiro de Fiscalização de Trânsito V|00:30:49
149|Resolução Contran nº 993/23 - Equipamentos Obrigatórios para a Frota de Veículos|00:30:35
150|Resolução Contran nº 993/23 - Equipamentos Obrigatórios para a Frota de Veículos II|00:31:00
151|Resolução Contran nº 993/23 - Equipamentos Obrigatórios para a Frota de Veículos III|00:30:39
152|Resolução Contran nº 993/23 - Equipamentos Obrigatórios para a Frota de Veículos IV|00:32:32
153|Resolução Contran nº 993/23 - Equipamentos Obrigatórios para a Frota de Veículos V|00:27:48
154|Resolução do Contran nº 996/23 - Ciclomotores, bicicletas elétricas e equipamentos de mobilidade individual autopropelidos|00:30:16
155|Resolução do Contran nº 996/23 - Ciclomotores, bicicletas elétricas e equipamentos de mobilidade individual autopropelidos II|00:31:33
156|Resolução CONTRAN nº 1.004/2023 - PNATRANS|00:39:26
157|Resolução Contran n.º 1.020/2025 - Habilitação de Condutores|00:31:15
158|Resolução Contran n.º 1.020/2025 - Habilitação de Condutores II|00:31:47
159|Resolução Contran n.º 1.020/2025 - Habilitação de Condutores III|00:31:09
160|Resolução Contran n.º 1.020/2025 - Habilitação de Condutores IV|00:32:18
161|Resolução Contran n.º 1.020/2025 - Habilitação de Condutores V|00:30:41
162|Resolução Contran n.º 1.020/2025 - Habilitação de Condutores VI|00:32:38
163|Resolução Contran n.º 1.020/2025 - Habilitação de Condutores VII|00:30:15
164|Resolução Contran n.º 1.020/2025 - Habilitação de Condutores VIII|00:30:22
165|Resolução Contran n.º 1.020/2025 - Habilitação de Condutores IX|00:30:19
166|Resolução Contran n.º 1.020/2025 - Habilitação de Condutores X|00:30:18
167|Resolução Contran n.º 1.020/2025 - Habilitação de Condutores XI|00:26:21
168|Lei Federal nº 5.970/73|00:26:16
169|Resolução 36/98 - Sinalização de Advertência para Imobilização na Via|00:27:30
170|Resolução 110/2000 - Calendário Nacional de Licenciamento|00:30:34
171|Resolução 909/2022 - Fiscalização por Videomonitoramento|00:27:30
172|Resolução 938/2022 - Requisitos para Uso do Cronotacógrafo|00:30:46
173|Resolução 938/2022 - Requisitos para Uso do Cronotacógrafo II|00:30:25
174|Resolução CONTRAN nº 723/2018 - Processos para Suspensão/Cassação da CNH|00:31:18
175|Resolução CONTRAN nº 723/2018 - Processos para Suspensão/Cassação da CNH II|00:31:42
176|Resolução CONTRAN nº 723/2018 - Processos para Suspensão/Cassação da CNH III|00:31:42
177|Resolução CONTRAN nº 723/2018 - Processos para Suspensão/Cassação da CNH IV|00:35:50
178|Resolução CONTRAN nº 945/2022 - Requistos para Amarração das Cargas Transportadas|00:33:06
179|Resolução CONTRAN nº 735/2018 - Requisitos para Circulação de Combinações de Transporte de Veículos|00:30:36
180|Resolução CONTRAN nº 735/2018 - Requisitos para Circulação de Combinações de Transporte de Veículos II|00:32:51
181|Resolução CONTRAN nº 809/2020 - Requisitos para Emissão do CRV e CLA|00:30:42
182|Resolução CONTRAN nº 809/2020 - Requisitos para Emissão do CRV e CLA II|00:28:41
183|Resolução CONTRAN nº 946/2022 - Regras para Transporte de Cargas a Granel|00:20:54
`;

export const GRAN_CURSOS_TRANSITO_PRF_META = {
  title: 'Plano de Aulas Gran Cursos - Legislação de Trânsito PRF',
  shortTitle: 'Plano de Aulas Gran Cursos - Trânsito PRF',
  subtitle: 'Organização das aulas por prioridade, com base na incidência das provas PRF e nos temas mais rentáveis de fiscalização rodoviária.',
  source: SOURCE,
  provider: PROVIDER,
  discipline: DISCIPLINE,
  totalLessons: 183,
  recommendedGroups: RECOMMENDED_GROUPS.map(([title, lessonNumbers]) => ({ title, lessonNumbers: [...lessonNumbers] }))
};

export const GRAN_CURSOS_TRANSITO_PRF_LESSONS = buildLessons();

export function validateGranCursosTransitoPrfLessons(lessons = GRAN_CURSOS_TRANSITO_PRF_LESSONS) {
  const errors = [];
  const byNumber = new Map();
  for (const lesson of lessons) {
    if (byNumber.has(lesson.lesson_number)) errors.push(`aula duplicada: ${lesson.lesson_number}`);
    byNumber.set(lesson.lesson_number, lesson);
    for (const field of ['lesson_number', 'title', 'provider', 'discipline', 'priority', 'priority_label', 'priority_weight', 'incidence_level', 'study_cycle', 'axis', 'theme', 'recommended_order', 'original_title', 'normalized_title', 'active', 'source']) {
      if (lesson[field] === null || lesson[field] === undefined || lesson[field] === '') errors.push(`aula ${lesson.lesson_number}: campo ausente ${field}`);
    }
  }
  if (lessons.length !== 183) errors.push(`total esperado 183, recebido ${lessons.length}`);
  for (let number = 1; number <= 183; number += 1) {
    if (!byNumber.has(number)) errors.push(`aula ausente: ${number}`);
  }
  for (const number of ESSENTIAL) if (byNumber.get(number)?.priority !== 'ESSENCIAL') errors.push(`aula ${number} deveria ser essencial`);
  for (const number of IMPORTANT) if (byNumber.get(number)?.priority !== 'IMPORTANTE') errors.push(`aula ${number} deveria ser importante`);
  for (const number of REVIEW) if (byNumber.get(number)?.priority !== 'REVISAO_RAPIDA') errors.push(`aula ${number} deveria ser revisão rápida`);
  for (const number of ESSENTIAL_ALTISSIMA) if (byNumber.get(number)?.incidence_level !== 'ALTISSIMA') errors.push(`aula ${number} deveria ter incidencia ALTISSIMA`);
  for (const number of ESSENTIAL_ALTA) if (byNumber.get(number)?.incidence_level !== 'ALTA') errors.push(`aula ${number} deveria ter incidencia ALTA`);
  for (const lesson of lessons) {
    const expectedWeight = priorityWeight(lesson.priority);
    if (lesson.priority_weight !== expectedWeight) errors.push(`aula ${lesson.lesson_number}: peso esperado ${expectedWeight}, recebido ${lesson.priority_weight}`);
    if (!['ALTISSIMA', 'ALTA', 'MEDIA', 'BAIXA'].includes(lesson.incidence_level)) errors.push(`aula ${lesson.lesson_number}: incidencia invalida ${lesson.incidence_level}`);
  }
  for (const number of [105, 106, 107, 108, 109, 110, 111]) {
    if (!/882\/2021/.test(byNumber.get(number)?.notes || '')) errors.push(`aula ${number}: observacao 882/2021 ausente`);
  }
  for (const number of [174, 175, 176, 177]) {
    if (!/723\/2018/.test(byNumber.get(number)?.notes || '')) errors.push(`aula ${number}: observacao 723/2018 ausente`);
  }
  if (!/Requisitos/.test(byNumber.get(178)?.normalized_title || '')) errors.push('aula 178: normalized_title nao corrigiu Requisitos');
  return { ok: errors.length === 0, errors };
}

function buildLessons() {
  const recommendedOrder = new Map();
  let order = 1;
  for (const [, lessonNumbers] of RECOMMENDED_GROUPS) {
    for (const number of lessonNumbers) {
      if (!recommendedOrder.has(number)) recommendedOrder.set(number, order++);
    }
  }

  return RAW_LESSONS.trim().split('\n').map((line) => {
    const [numberText, originalTitle, durationText = ''] = line.split('|');
    const lessonNumber = Number(numberText);
    const priority = priorityFor(lessonNumber);
    const axis = axisFor(lessonNumber, originalTitle);
    const normalizedTitle = normalizeLessonTitle(lessonNumber, originalTitle);
    return {
      lesson_number: lessonNumber,
      title: normalizedTitle,
      provider: PROVIDER,
      discipline: DISCIPLINE,
      professor: PROFESSOR,
      duration: durationText || null,
      duration_seconds: durationText ? durationToSeconds(durationText) : null,
      priority,
      priority_label: priorityLabel(priority),
      priority_weight: priorityWeight(priority),
      incidence_level: incidenceLevel(lessonNumber, priority),
      study_cycle: studyCycle(priority),
      axis,
      theme: themeFromTitle(normalizedTitle),
      resolution_article: resolutionArticleFromTitle(normalizedTitle),
      incidence_reason: incidenceReason(priority, axis),
      recommended_order: recommendedOrder.get(lessonNumber) || 999,
      original_title: originalTitle,
      normalized_title: normalizedTitle,
      notes: notesFor(lessonNumber),
      active: true,
      source: SOURCE
    };
  }).sort((left, right) => left.recommended_order - right.recommended_order || left.lesson_number - right.lesson_number);
}

function priorityFor(number) {
  if (ESSENTIAL.has(number)) return 'ESSENCIAL';
  if (IMPORTANT.has(number)) return 'IMPORTANTE';
  if (REVIEW.has(number)) return 'REVISAO_RAPIDA';
  return 'IMPORTANTE';
}

function priorityLabel(priority) {
  return {
    ESSENCIAL: 'Essencial',
    IMPORTANTE: 'Importante',
    REVISAO_RAPIDA: 'Revisão rápida'
  }[priority] || 'Importante';
}

function priorityWeight(priority) {
  return {
    ESSENCIAL: 100,
    IMPORTANTE: 60,
    REVISAO_RAPIDA: 30
  }[priority] || 60;
}

function incidenceLevel(number, priority) {
  if (ESSENTIAL_ALTISSIMA.has(number)) return 'ALTISSIMA';
  if (ESSENTIAL_ALTA.has(number)) return 'ALTA';
  if (priority === 'IMPORTANTE') return 'MEDIA';
  return 'BAIXA';
}

function studyCycle(priority) {
  return {
    ESSENCIAL: 'Primeiro ciclo',
    IMPORTANTE: 'Segundo ciclo',
    REVISAO_RAPIDA: 'Revisão rápida'
  }[priority] || 'Segundo ciclo';
}

function axisFor(number, title) {
  for (const [axis, , lessonNumbers] of AXIS_GROUPS) {
    if (lessonNumbers.has(number)) return axis;
  }
  if (number === 24) return 'Base do CTB e competências';
  if (/Anexo I/i.test(title)) return 'Base do CTB e competências';
  return 'Revisão e complementares';
}

function normalizeLessonTitle(number, title) {
  if (number >= 105 && number <= 111) return title.replace('882/2020', '882/2021');
  if (number === 178) return title.replace('Requistos', 'Requisitos');
  return title;
}

function notesFor(number) {
  if (number >= 105 && number <= 111) return 'No título do curso consta Res. 882/2020, mas o plano trata o tema como Res. 882/2021, referente a pesos e dimensões.';
  if (number >= 174 && number <= 177) return 'No título do curso consta Res. 723/201, mas o correto é Res. 723/2018.';
  if (number === 178) return 'Corrigido em título normalizado: “Requisitos” em vez de “Requistos”.';
  if ([181, 182].includes(number)) return 'Tag secundária: Documentos veiculares.';
  return '';
}

function incidenceReason(priority, axis) {
  const base = {
    ESSENCIAL: 'Tema/eixo prioritário por incidência e rentabilidade no estudo PRF; deve entrar no primeiro ciclo.',
    IMPORTANTE: 'Tema importante para consolidar a base e completar o plano PRF após o núcleo mais cobrado.',
    REVISAO_RAPIDA: 'Tema complementar ou de menor prioridade; usar para revisão rápida depois do conteúdo principal.'
  }[priority];
  const axisNote = AXIS_GROUPS.find(([name]) => name === axis)?.[1] || '';
  return [base, axisNote].filter(Boolean).join(' ');
}

function themeFromTitle(title) {
  const parts = String(title || '').split(' - ').map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(' - ') : parts[0] || '';
}

function resolutionArticleFromTitle(title) {
  const matches = [];
  const patterns = [
    /\bArt\.?\s*[^-]+/i,
    /\bRes(?:olu[cç][aã]o)?(?:\s+CONTRAN|\s+Contran|\s+do\s+Contran|\s+do\s+CONTRAN)?[^-:]*(?:\d{1,4}(?:\.\d{3})?\/\d{2,4}|\d{1,4}\/\d{2})/i,
    /\bLei\s+Federal\s+n[º.]\s*[\d.]+\/\d{2,4}/i,
    /\bAnexo\s+I\b/i
  ];
  for (const pattern of patterns) {
    const match = String(title || '').match(pattern);
    if (match) matches.push(match[0].trim());
  }
  return [...new Set(matches)].join('; ');
}

function durationToSeconds(value) {
  const [hours, minutes, seconds] = String(value || '').split(':').map(Number);
  if (![hours, minutes, seconds].every(Number.isFinite)) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

function numbers(value) {
  return new Set(String(value || '').match(/\d+/g)?.map(Number) || []);
}
