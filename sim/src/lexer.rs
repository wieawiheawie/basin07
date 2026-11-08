#[derive(Debug, Clone, PartialEq)]
pub enum TokenKind {
    Word(String),
    Number(f32),
    LeftParen,
    RightParen,
    Comma,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Token {
    pub kind: TokenKind,
    pub offset: usize,
}

pub fn lex(source: &str) -> Result<Vec<Token>, String> {
    let mut tokens = Vec::new();
    let mut chars = source.char_indices().peekable();

    while let Some((offset, ch)) = chars.next() {
        if ch.is_whitespace() {
            continue;
        }

        let kind = match ch {
            '(' => TokenKind::LeftParen,
            ')' => TokenKind::RightParen,
            ',' => TokenKind::Comma,
            '-' | '0'..='9' | '.' => {
                let mut number = String::new();
                number.push(ch);

                while let Some((_, next)) = chars.peek() {
                    if next.is_ascii_digit() || *next == '.' {
                        number.push(*next);
                        chars.next();
                    } else {
                        break;
                    }
                }

                if matches!(chars.peek(), Some((_, 'e' | 'E'))) {
                    number.push(chars.next().expect("peeked exponent marker").1);

                    if matches!(chars.peek(), Some((_, '+' | '-'))) {
                        number.push(chars.next().expect("peeked exponent sign").1);
                    }

                    let exponent_start = number.len();
                    while let Some((_, next)) = chars.peek() {
                        if next.is_ascii_digit() {
                            number.push(*next);
                            chars.next();
                        } else {
                            break;
                        }
                    }
                    if number.len() == exponent_start {
                        return Err(format!(
                            "I couldn't read the exponent in '{number}' at character {}.",
                            offset + 1
                        ));
                    }
                }

                let value = number
                    .parse::<f32>()
                    .map_err(|_| format!("I couldn't read the number '{number}' at character {}.", offset + 1))?;
                if !value.is_finite() {
                    return Err("Numbers must be finite values.".to_owned());
                }
                TokenKind::Number(value)
            }
            _ if ch.is_alphanumeric() || ch == '_' => {
                let mut word = String::new();
                word.push(ch);
                while let Some((_, next)) = chars.peek() {
                    if next.is_alphanumeric() || *next == '_' || *next == '-' {
                        word.push(*next);
                        chars.next();
                    } else {
                        break;
                    }
                }
                TokenKind::Word(word)
            }
            _ => return Err(format!("I don't know the character '{ch}' at character {}.", offset + 1)),
        };

        tokens.push(Token { kind, offset });
    }

    Ok(tokens)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lexes_words_numbers_and_coordinates() {
        let tokens = lex("carve from (2.5, 3) to (8, -1)").unwrap();
        assert_eq!(tokens.len(), 13);
        assert_eq!(tokens[0].kind, TokenKind::Word("carve".to_owned()));
        assert_eq!(tokens[2].kind, TokenKind::LeftParen);
        assert_eq!(tokens[3].kind, TokenKind::Number(2.5));
        assert_eq!(tokens[5].kind, TokenKind::Number(3.0));
        assert_eq!(tokens[12].kind, TokenKind::RightParen);
    }

    #[test]
    fn accepts_scientific_notation_and_rejects_invalid_numbers() {
        assert_eq!(lex("look 1.25e-2").unwrap()[1].kind, TokenKind::Number(0.0125));
        assert!(lex("look bottle!").is_err());
        assert!(lex("look 1.2.3").is_err());
        assert!(lex("tip bottle 1e999").is_err());
        assert!(lex("look 4e+").is_err());
    }

    #[test]
    fn accepts_underscored_object_names() {
        let tokens = lex("bottle_2").unwrap();
        assert_eq!(tokens[0].kind, TokenKind::Word("bottle_2".to_owned()));
    }
}
