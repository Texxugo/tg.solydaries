/**
 * Os numeros que decidem como as batidas sao lidas, num lugar so.
 *
 * Modulo puro e sem dependencia: a apuracao, a grade e a sugestao de escalas
 * importam daqui, e mudar um valor muda as tres leituras juntas. Nada disso e
 * gravado — como toda a apuracao, a troca vale tambem para os dias que ja
 * passaram, na proxima abertura da tela.
 */

/**
 * A margem de cada ponta do turno, comparada com o horario da escala. Dez
 * minutos e o que a CLT (art. 58, §1o) nao considera jornada extraordinaria.
 *
 * Dentro da margem, a batida **vale o horario previsto**: nao gera extra nem
 * atraso. Fora dela, a variacao entra inteira — entrar 07:20 numa escala das
 * 07:00 e vinte minutos de atraso, e nao dez. Nao e franquia.
 *
 * Sao duas constantes, e nao uma, porque a regra e por ponta: quem entra 06:52 e
 * sai 17:09 esta na margem nas duas batidas, e somadas elas dariam 17 minutos
 * de "hora extra" que ninguem fez.
 */
export const TOLERANCIA_ENTRADA_MINUTOS = 10;
export const TOLERANCIA_SAIDA_MINUTOS = 10;

/**
 * Quanto o intervalo marcado pode ficar abaixo do previsto antes de virar
 * `intrajornada_curta`. Mesma margem das pontas, mas outra regra: aqui so o
 * intervalo curto acusa.
 */
export const TOLERANCIA_INTRAJORNADA_MINUTOS = 10;

/**
 * A partir de quantos minutos sem batida comeca outra jornada.
 *
 * Oito horas separam com folga o maior intervalo de refeicao (duas horas, pela
 * CLT) do menor descanso entre jornadas (onze). E e o intervalo, e nao a data
 * do calendario nem o horario da escala, que diz onde um plantao termina: no
 * 12x36 com troca interna, a saida de um plantao e a entrada do proximo caem na
 * mesma data, e so a distancia entre elas mostra que sao duas jornadas.
 */
export const INTERVALO_NOVA_JORNADA_MINUTOS = 8 * 60;

/**
 * O mais longo que uma jornada pode ir da entrada a ultima batida.
 *
 * Existe porque as 8h acima so separam jornadas **depois de uma saida**: entre
 * a entrada e a saida de um 12x36 que marca so as duas pontas ha doze horas, e
 * elas sao trabalho, e nao descanso. Sem um teto, a saida esquecida emendaria
 * jornadas — 07:00 sem saida mais 07:00 do dia seguinte viraria uma jornada so,
 * e dali em diante cada entrada passaria a ser lida como saida. Dezesseis horas
 * cabem o plantao de doze com folga e ficam abaixo de qualquer "entrada sem
 * saida" seguida da entrada do dia seguinte.
 */
export const DURACAO_MAXIMA_DA_JORNADA_MINUTOS = 16 * 60;

/**
 * Quanto depois da saida prevista uma jornada **sem a entrada** ainda e lida
 * como o fim do turno da vespera.
 *
 * O plantao noturno com a entrada esquecida chega so com o que veio depois da
 * meia-noite (02:06 03:05 06:01). Pela data da primeira batida ele seria do dia
 * seguinte — uma falta no dia do plantao e um "trabalho em folga" no outro. Se
 * a jornada cabe inteira no turno previsto da vespera, e a vespera ficou sem
 * jornada propria, ela volta para la. Duas horas cobrem a saida atrasada sem
 * alcancar o plantao diurno de quem trocou de turno (06:00-18:00 no dia
 * seguinte a um noturno das 18:00 as 06:00 fica de fora).
 */
export const MARGEM_DO_TURNO_SEM_ENTRADA_MINUTOS = 2 * 60;
